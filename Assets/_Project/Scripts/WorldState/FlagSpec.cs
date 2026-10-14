using System;
using System.Collections.Generic;
using System.Globalization;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Immutable data of one world state entry (architecture 8.2), created from a <see cref="FlagDefinition"/> asset or in
    /// code (tests). Knows how values of its kind are clamped, checked, shown and parsed.
    /// </summary>
    public sealed class FlagSpec
    {
        private readonly string[] _enumValues;

        /// <summary>Creates the spec.</summary>
        /// <param name="id">Flag id (<c>flag.*</c> or <c>stat.*</c>).</param>
        /// <param name="kind">Kind.</param>
        /// <param name="defaultValue">Start value (normalized to the kind).</param>
        /// <param name="min">Minimum (story numbers).</param>
        /// <param name="max">Maximum (story numbers; counters: 0 = no maximum).</param>
        /// <param name="enumValues">German names per value (enums; index = value, 0 = unknown/start).</param>
        /// <param name="carryToNewGamePlus">True if the value is kept in New Game+ (proposal, architecture 8.2).</param>
        /// <param name="description">Meaning and owner (quest, region).</param>
        public FlagSpec(string id, FlagKind kind, int defaultValue = 0, int min = 0, int max = 0, IReadOnlyList<string> enumValues = null,
                        bool carryToNewGamePlus = false, string description = "")
        {
            Id = id ?? string.Empty;
            Kind = kind;
            Min = min;
            Max = kind == FlagKind.StoryNumber && max < min ? min : max;
            if (enumValues == null || enumValues.Count == 0)
            {
                _enumValues = Array.Empty<string>();
            }
            else
            {
                _enumValues = new string[enumValues.Count];
                for (int i = 0; i < enumValues.Count; i++)
                {
                    _enumValues[i] = enumValues[i] ?? string.Empty;
                }
            }

            CarryToNewGamePlus = carryToNewGamePlus;
            Description = description ?? string.Empty;
            DefaultValue = Normalize(defaultValue);
        }

        /// <summary>Flag id.</summary>
        public string Id { get; }

        /// <summary>Kind.</summary>
        public FlagKind Kind { get; }

        /// <summary>Start value (already normalized).</summary>
        public int DefaultValue { get; }

        /// <summary>Minimum (story numbers).</summary>
        public int Min { get; }

        /// <summary>Maximum (story numbers; counters: 0 = none).</summary>
        public int Max { get; }

        /// <summary>German names of the enum values (index = value).</summary>
        public IReadOnlyList<string> EnumValues => _enumValues;

        /// <summary>True if the value is kept in New Game+.</summary>
        public bool CarryToNewGamePlus { get; }

        /// <summary>Meaning and owner.</summary>
        public string Description { get; }

        /// <summary>Bool flag with default false.</summary>
        /// <param name="id">Flag id.</param>
        public static FlagSpec Bool(string id)
        {
            return new FlagSpec(id, FlagKind.Bool);
        }

        /// <summary>Counter (at least 0, no maximum).</summary>
        /// <param name="id">Flag id.</param>
        public static FlagSpec Counter(string id)
        {
            return new FlagSpec(id, FlagKind.Counter);
        }

        /// <summary>Enum flag; value 0 is the first name (unknown/start).</summary>
        /// <param name="id">Flag id.</param>
        /// <param name="names">German names, index = value.</param>
        public static FlagSpec Enum(string id, params string[] names)
        {
            return new FlagSpec(id, FlagKind.Enum, 0, 0, 0, names);
        }

        /// <summary>Story number with a range.</summary>
        /// <param name="id">Flag id.</param>
        /// <param name="min">Minimum.</param>
        /// <param name="max">Maximum.</param>
        /// <param name="defaultValue">Start value.</param>
        public static FlagSpec StoryNumber(string id, int min, int max, int defaultValue)
        {
            return new FlagSpec(id, FlagKind.StoryNumber, defaultValue, min, max);
        }

        /// <summary>
        /// Brings a value into the range of the kind: bool 0/1, counter at least 0 (and at most <see cref="Max"/> if set),
        /// enum at least 0, story number clamped to <see cref="Min"/>-<see cref="Max"/>.
        /// </summary>
        /// <param name="value">Raw value.</param>
        public int Normalize(int value)
        {
            switch (Kind)
            {
                case FlagKind.Bool:
                    return value != 0 ? 1 : 0;
                case FlagKind.Counter:
                    value = Math.Max(0, value);
                    return Max > 0 ? Math.Min(Max, value) : value;
                case FlagKind.Enum:
                    return Math.Max(0, value);
                case FlagKind.StoryNumber:
                    return Math.Min(Max, Math.Max(Min, value));
                default:
                    return value;
            }
        }

        /// <summary>
        /// True if the value is allowed for this flag without clamping (validator V17: enum values must be in the list).
        /// </summary>
        /// <param name="value">Value.</param>
        public bool IsKnownValue(int value)
        {
            switch (Kind)
            {
                case FlagKind.Bool:
                    return value == 0 || value == 1;
                case FlagKind.Counter:
                    return value >= 0 && (Max <= 0 || value <= Max);
                case FlagKind.Enum:
                    return value >= 0 && (_enumValues.Length == 0 || value < _enumValues.Length);
                case FlagKind.StoryNumber:
                    return value >= Min && value <= Max;
                default:
                    return true;
            }
        }

        /// <summary>Display text of a value: <c>wahr</c>/<c>falsch</c>, enum <c>4 (Muehlenwache)</c>, otherwise the number.</summary>
        /// <param name="value">Value.</param>
        public string FormatValue(int value)
        {
            if (Kind == FlagKind.Bool)
            {
                return value != 0 ? "wahr" : "falsch";
            }

            if (Kind == FlagKind.Enum && value >= 0 && value < _enumValues.Length && _enumValues[value].Length > 0)
            {
                return value.ToString(CultureInfo.InvariantCulture) + " (" + _enumValues[value] + ")";
            }

            return value.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Parses console input (<c>set_flag</c>, architecture 14.2): a number, a bool word (true/false, wahr/falsch, ja/nein,
        /// an/aus, on/off) or an enum name (case-insensitive).
        /// </summary>
        /// <param name="text">Input.</param>
        /// <param name="value">Parsed value (not normalized).</param>
        /// <returns>True if the text was understood.</returns>
        public bool TryParseValue(string text, out int value)
        {
            if (TryParseCommon(text, out value))
            {
                return true;
            }

            string trimmed = text.Trim();
            for (int i = 0; i < _enumValues.Length; i++)
            {
                if (string.Equals(_enumValues[i], trimmed, StringComparison.OrdinalIgnoreCase))
                {
                    value = i;
                    return true;
                }
            }

            value = 0;
            return false;
        }

        /// <summary>Parses a number or a bool word without a spec (undefined flags).</summary>
        /// <param name="text">Input.</param>
        /// <param name="value">Parsed value.</param>
        public static bool TryParseCommon(string text, out int value)
        {
            value = 0;
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }

            string trimmed = text.Trim();
            if (int.TryParse(trimmed, NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
            {
                return true;
            }

            switch (trimmed.ToLowerInvariant())
            {
                case "true":
                case "wahr":
                case "ja":
                case "an":
                case "on":
                    value = 1;
                    return true;
                case "false":
                case "falsch":
                case "nein":
                case "aus":
                case "off":
                    value = 0;
                    return true;
                default:
                    value = 0;
                    return false;
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Id + " (" + Kind + ", Standard " + FormatValue(DefaultValue) + ")";
        }
    }
}
