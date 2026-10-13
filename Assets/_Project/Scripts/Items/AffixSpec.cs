using System;
using Aetherfall.Stats;

namespace Aetherfall.Items
{
    /// <summary>
    /// Plain data of an affix (GDD 04 4.3/4.4; built from <see cref="AffixDefinition"/> or in tests): kind, family, target
    /// stat and modifier kind, value range of tier I and tier VI, weight, allowed slots and the affixes it excludes.
    /// </summary>
    /// <remarks>
    /// Values are in display units ("+5 %" = 5); <see cref="ValueScale"/> converts them to the stat modifier (0.01 for
    /// fractions such as crit chance, 1 for flat values such as armor). Ranges of the tiers in between are interpolated
    /// linearly (GDD 04 4.3: Wert(n) = Wert(I) + (Wert(VI) − Wert(I)) × (n − 1) ÷ 5, rounded).
    /// </remarks>
    public sealed class AffixSpec
    {
        /// <summary>Highest affix tier (VI).</summary>
        public const int MaxTier = 6;

        /// <summary>Affix id, e.g. <c>affix.grausam</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name, e.g. "Grausam" or "des Gluecks". TODO (localization step): LocalizedString.</summary>
        public string DisplayName { get; set; } = string.Empty;

        /// <summary>German effect text with <c>{0}</c> for the value, e.g. "+{0} % Krit-Schaden".</summary>
        public string EffectText { get; set; } = "{0}";

        /// <summary>Prefix or suffix.</summary>
        public AffixKind Kind { get; set; }

        /// <summary>Family id (GDD 04 4.4 column "Familie"), e.g. <c>krit_schaden</c>; at most <see cref="FamilyLimit"/> per item.</summary>
        public string FamilyId { get; set; } = string.Empty;

        /// <summary>How many affixes of the family one item may have (1; resistances 2 different ones).</summary>
        public int FamilyLimit { get; set; } = 1;

        /// <summary>Target stat (<see cref="StatId.None"/> = effect without stat, comes with its system).</summary>
        public StatId Stat { get; set; }

        /// <summary>How the value changes the stat.</summary>
        public StatModifierKind ModifierKind { get; set; } = StatModifierKind.Flat;

        /// <summary>Factor from display units to the modifier value (0.01 for "+X %" on fraction stats).</summary>
        public float ValueScale { get; set; } = 1f;

        /// <summary>Lower bound of tier I.</summary>
        public float TierOneMin { get; set; }

        /// <summary>Upper bound of tier I.</summary>
        public float TierOneMax { get; set; }

        /// <summary>Lower bound of tier VI.</summary>
        public float TierSixMin { get; set; }

        /// <summary>Upper bound of tier VI.</summary>
        public float TierSixMax { get; set; }

        /// <summary>Decimal places of values (0 or 1, e.g. crit chance 1.5).</summary>
        public int Decimals { get; set; }

        /// <summary>Roll weight (GDD 04 4.3: standard 100, strong 50, utility 60).</summary>
        public int Weight { get; set; } = 100;

        /// <summary>Item slots the affix may roll on.</summary>
        public AffixSlots AllowedSlots { get; set; }

        /// <summary>Affix ids that may never appear together with this one (GDD 04 4.3 rules 4 and 5).</summary>
        public string[] ExcludedAffixIds { get; set; } = Array.Empty<string>();

        /// <summary>Value range of a tier (rounded to <see cref="Decimals"/>).</summary>
        /// <param name="tier">Tier 1–6 (clamped).</param>
        /// <param name="min">Lower bound.</param>
        /// <param name="max">Upper bound (never below <paramref name="min"/>).</param>
        public void RangeForTier(int tier, out float min, out float max)
        {
            int n = Math.Max(1, Math.Min(MaxTier, tier));
            float t = (n - 1) / 5f;
            min = Round(TierOneMin + (TierSixMin - TierOneMin) * t);
            max = Round(TierOneMax + (TierSixMax - TierOneMax) * t);
            if (max < min)
            {
                max = min;
            }
        }

        /// <summary>True if <paramref name="otherId"/> is excluded by this affix.</summary>
        /// <param name="otherId">Other affix id.</param>
        public bool Excludes(string otherId)
        {
            string[] excluded = ExcludedAffixIds;
            if (excluded == null)
            {
                return false;
            }

            for (int i = 0; i < excluded.Length; i++)
            {
                if (string.Equals(excluded[i], otherId, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Formats a rolled value with <see cref="EffectText"/>, e.g. "+16 % Krit-Schaden".</summary>
        /// <param name="value">Value in display units.</param>
        public string Describe(float value)
        {
            string number = value.ToString(Decimals > 0 ? "0.0" : "0", System.Globalization.CultureInfo.InvariantCulture);
            string format = string.IsNullOrEmpty(EffectText) ? "{0}" : EffectText;
            try
            {
                return string.Format(System.Globalization.CultureInfo.InvariantCulture, format, number);
            }
            catch (FormatException)
            {
                return format + " " + number;
            }
        }

        /// <summary>Returns an error text if the data is unusable, otherwise an empty string.</summary>
        public string Validate()
        {
            if (string.IsNullOrEmpty(Id))
            {
                return "Affix without id.";
            }

            if (Weight < 0 || FamilyLimit < 1)
            {
                return "Affix '" + Id + "': weight must be 0 or more and the family limit at least 1.";
            }

            if (AllowedSlots == AffixSlots.None)
            {
                return "Affix '" + Id + "' has no allowed slot.";
            }

            if (TierOneMax < TierOneMin || TierSixMax < TierSixMin)
            {
                return "Affix '" + Id + "': the upper bound of a tier is below its lower bound.";
            }

            return string.Empty;
        }

        /// <summary>Rounds a value to <see cref="Decimals"/> places (commercial rounding).</summary>
        /// <param name="value">Value.</param>
        public float Round(float value)
        {
            return (float)Math.Round(value, Math.Max(0, Math.Min(3, Decimals)), MidpointRounding.AwayFromZero);
        }
    }
}
