using System;
using System.Collections.Generic;
using System.Globalization;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// One value of a parsed JSON document (<see cref="DungeonJsonParser"/>) with its path for error messages
    /// (<c>rooms[2].width</c>). Typed getters throw <see cref="DungeonLayoutException"/> with the path when a value is missing or
    /// has the wrong kind, so the layout reader reports "Feld rooms[2].width fehlt" instead of a null reference.
    /// </summary>
    /// <remarks>
    /// Own minimal JSON model on purpose: Aetherfall.World must not reference Newtonsoft (architecture 3.3: only SaveSystem uses
    /// it) and the layout file is read in the editor generator, in tests and (later) at run time. Pure C#, no UnityEngine.
    /// </remarks>
    public sealed class DungeonJsonValue
    {
        private readonly List<DungeonJsonValue> _items;
        private readonly List<string> _keys;
        private readonly Dictionary<string, DungeonJsonValue> _members;

        private DungeonJsonValue(DungeonJsonKind kind, string path)
        {
            Kind = kind;
            Path = path ?? string.Empty;
            if (kind == DungeonJsonKind.Array)
            {
                _items = new List<DungeonJsonValue>();
            }
            else if (kind == DungeonJsonKind.Object)
            {
                _keys = new List<string>();
                _members = new Dictionary<string, DungeonJsonValue>(StringComparer.Ordinal);
            }
        }

        /// <summary>Kind of the value.</summary>
        public DungeonJsonKind Kind { get; }

        /// <summary>Path in the document, e.g. <c>rooms[2].width</c> (empty for the root).</summary>
        public string Path { get; }

        /// <summary>Boolean value (kind <see cref="DungeonJsonKind.Boolean"/>).</summary>
        public bool BooleanValue { get; private set; }

        /// <summary>Number value (kind <see cref="DungeonJsonKind.Number"/>).</summary>
        public double NumberValue { get; private set; }

        /// <summary>String value (kind <see cref="DungeonJsonKind.String"/>).</summary>
        public string StringValue { get; private set; } = string.Empty;

        /// <summary>Items of an array (empty for other kinds).</summary>
        public IReadOnlyList<DungeonJsonValue> Items => _items ?? (IReadOnlyList<DungeonJsonValue>)Array.Empty<DungeonJsonValue>();

        /// <summary>Keys of an object in file order (empty for other kinds).</summary>
        public IReadOnlyList<string> Keys => _keys ?? (IReadOnlyList<string>)Array.Empty<string>();

        /// <summary>Number of items (array) or members (object).</summary>
        public int Count => _items != null ? _items.Count : _keys != null ? _keys.Count : 0;

        /// <summary>Creates a null value.</summary>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateNull(string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.Null, path);
        }

        /// <summary>Creates a boolean value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateBoolean(bool value, string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.Boolean, path) { BooleanValue = value };
        }

        /// <summary>Creates a number value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateNumber(double value, string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.Number, path) { NumberValue = value };
        }

        /// <summary>Creates a string value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateString(string value, string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.String, path) { StringValue = value ?? string.Empty };
        }

        /// <summary>Creates an empty array.</summary>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateArray(string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.Array, path);
        }

        /// <summary>Creates an empty object.</summary>
        /// <param name="path">Path in the document.</param>
        public static DungeonJsonValue CreateObject(string path)
        {
            return new DungeonJsonValue(DungeonJsonKind.Object, path);
        }

        /// <summary>Appends an item to an array.</summary>
        /// <param name="item">Item.</param>
        public void AddItem(DungeonJsonValue item)
        {
            if (_items == null)
            {
                throw new InvalidOperationException("Only arrays have items.");
            }

            _items.Add(item ?? CreateNull(Path + "[" + _items.Count + "]"));
        }

        /// <summary>Adds a member to an object.</summary>
        /// <param name="key">Key (unique).</param>
        /// <param name="value">Value.</param>
        /// <returns>False if the key exists already.</returns>
        public bool TryAddMember(string key, DungeonJsonValue value)
        {
            if (_members == null)
            {
                throw new InvalidOperationException("Only objects have members.");
            }

            if (key == null || _members.ContainsKey(key))
            {
                return false;
            }

            _keys.Add(key);
            _members.Add(key, value ?? CreateNull(Path + "." + key));
            return true;
        }

        /// <summary>True if the object has the member and it is not <c>null</c>.</summary>
        /// <param name="key">Key.</param>
        public bool Has(string key)
        {
            return _members != null && _members.TryGetValue(key, out DungeonJsonValue value) && value.Kind != DungeonJsonKind.Null;
        }

        /// <summary>Member of an object, or null if it is missing.</summary>
        /// <param name="key">Key.</param>
        public DungeonJsonValue Member(string key)
        {
            if (_members != null && _members.TryGetValue(key, out DungeonJsonValue value) && value.Kind != DungeonJsonKind.Null)
            {
                return value;
            }

            return null;
        }

        /// <summary>Required member of an object.</summary>
        /// <param name="key">Key.</param>
        /// <exception cref="DungeonLayoutException">The member is missing.</exception>
        public DungeonJsonValue Required(string key)
        {
            RequireKind(DungeonJsonKind.Object);
            DungeonJsonValue value = Member(key);
            if (value == null)
            {
                throw new DungeonLayoutException("Feld '" + Join(Path, key) + "' fehlt.");
            }

            return value;
        }

        /// <summary>Required string member.</summary>
        /// <param name="key">Key.</param>
        public string GetString(string key)
        {
            return Required(key).AsString();
        }

        /// <summary>Optional string member.</summary>
        /// <param name="key">Key.</param>
        /// <param name="fallback">Value if the member is missing.</param>
        public string GetString(string key, string fallback)
        {
            DungeonJsonValue value = Member(key);
            return value != null ? value.AsString() : fallback;
        }

        /// <summary>Required number member as float.</summary>
        /// <param name="key">Key.</param>
        public float GetFloat(string key)
        {
            return Required(key).AsFloat();
        }

        /// <summary>Optional number member as float.</summary>
        /// <param name="key">Key.</param>
        /// <param name="fallback">Value if the member is missing.</param>
        public float GetFloat(string key, float fallback)
        {
            DungeonJsonValue value = Member(key);
            return value != null ? value.AsFloat() : fallback;
        }

        /// <summary>Required whole number member.</summary>
        /// <param name="key">Key.</param>
        public int GetInt(string key)
        {
            return Required(key).AsInt();
        }

        /// <summary>Optional whole number member.</summary>
        /// <param name="key">Key.</param>
        /// <param name="fallback">Value if the member is missing.</param>
        public int GetInt(string key, int fallback)
        {
            DungeonJsonValue value = Member(key);
            return value != null ? value.AsInt() : fallback;
        }

        /// <summary>Optional boolean member.</summary>
        /// <param name="key">Key.</param>
        /// <param name="fallback">Value if the member is missing.</param>
        public bool GetBool(string key, bool fallback)
        {
            DungeonJsonValue value = Member(key);
            if (value == null)
            {
                return fallback;
            }

            value.RequireKind(DungeonJsonKind.Boolean);
            return value.BooleanValue;
        }

        /// <summary>Optional array member; an empty list if it is missing.</summary>
        /// <param name="key">Key.</param>
        public IReadOnlyList<DungeonJsonValue> GetArray(string key)
        {
            DungeonJsonValue value = Member(key);
            if (value == null)
            {
                return Array.Empty<DungeonJsonValue>();
            }

            value.RequireKind(DungeonJsonKind.Array);
            return value.Items;
        }

        /// <summary>Optional array of strings; an empty list if it is missing.</summary>
        /// <param name="key">Key.</param>
        public List<string> GetStringList(string key)
        {
            IReadOnlyList<DungeonJsonValue> items = GetArray(key);
            var result = new List<string>(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                result.Add(items[i].AsString());
            }

            return result;
        }

        /// <summary>The value as string.</summary>
        public string AsString()
        {
            RequireKind(DungeonJsonKind.String);
            return StringValue;
        }

        /// <summary>The value as float (must be finite).</summary>
        public float AsFloat()
        {
            RequireKind(DungeonJsonKind.Number);
            if (double.IsNaN(NumberValue) || double.IsInfinity(NumberValue) || Math.Abs(NumberValue) > 1e7)
            {
                throw new DungeonLayoutException("Feld '" + Path + "' hat keinen gültigen Zahlenwert.");
            }

            return (float)NumberValue;
        }

        /// <summary>The value as whole number.</summary>
        public int AsInt()
        {
            RequireKind(DungeonJsonKind.Number);
            double rounded = Math.Round(NumberValue);
            if (Math.Abs(rounded - NumberValue) > 1e-9 || Math.Abs(rounded) > int.MaxValue)
            {
                throw new DungeonLayoutException("Feld '" + Path + "' muss eine ganze Zahl sein (gefunden: " +
                                                 NumberValue.ToString(CultureInfo.InvariantCulture) + ").");
            }

            return (int)rounded;
        }

        /// <summary>Throws if the value has another kind.</summary>
        /// <param name="expected">Expected kind.</param>
        public void RequireKind(DungeonJsonKind expected)
        {
            if (Kind != expected)
            {
                throw new DungeonLayoutException("Feld '" + (Path.Length > 0 ? Path : "(Wurzel)") + "' muss " + GermanKind(expected) + " sein, ist aber " +
                                                 GermanKind(Kind) + ".");
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            switch (Kind)
            {
                case DungeonJsonKind.Boolean:
                    return BooleanValue ? "true" : "false";
                case DungeonJsonKind.Number:
                    return NumberValue.ToString(CultureInfo.InvariantCulture);
                case DungeonJsonKind.String:
                    return "\"" + StringValue + "\"";
                case DungeonJsonKind.Array:
                    return "[" + Count + " Einträge]";
                case DungeonJsonKind.Object:
                    return "{" + Count + " Felder}";
                default:
                    return "null";
            }
        }

        private static string Join(string path, string key)
        {
            return string.IsNullOrEmpty(path) ? key : path + "." + key;
        }

        private static string GermanKind(DungeonJsonKind kind)
        {
            switch (kind)
            {
                case DungeonJsonKind.Boolean:
                    return "true/false";
                case DungeonJsonKind.Number:
                    return "eine Zahl";
                case DungeonJsonKind.String:
                    return "ein Text";
                case DungeonJsonKind.Array:
                    return "eine Liste";
                case DungeonJsonKind.Object:
                    return "ein Objekt";
                default:
                    return "null";
            }
        }
    }
}
