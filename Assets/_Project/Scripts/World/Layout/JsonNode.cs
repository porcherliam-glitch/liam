using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// One value of a JSON document read by <see cref="LayoutJsonParser"/>. Objects keep the member order of the file.
    /// Pure C#, no Unity or Newtonsoft dependency (architecture 3.3: only SaveSystem references Newtonsoft, and the World
    /// assembly must not fall away when the Newtonsoft package is missing).
    /// </summary>
    public sealed class JsonNode
    {
        private static readonly IReadOnlyList<JsonNode> NoItems = new JsonNode[0];
        private static readonly IReadOnlyList<KeyValuePair<string, JsonNode>> NoMembers = new KeyValuePair<string, JsonNode>[0];

        private readonly List<JsonNode> _items;
        private readonly List<KeyValuePair<string, JsonNode>> _members;
        private readonly Dictionary<string, JsonNode> _byName;

        private JsonNode(JsonNodeKind kind, int line)
        {
            Kind = kind;
            Line = line;
            if (kind == JsonNodeKind.Array)
            {
                _items = new List<JsonNode>();
            }
            else if (kind == JsonNodeKind.Object)
            {
                _members = new List<KeyValuePair<string, JsonNode>>();
                _byName = new Dictionary<string, JsonNode>(StringComparer.Ordinal);
            }
        }

        /// <summary>Kind of the value.</summary>
        public JsonNodeKind Kind { get; }

        /// <summary>1-based line where the value starts (for error messages).</summary>
        public int Line { get; }

        /// <summary>String value (empty for other kinds).</summary>
        public string StringValue { get; private set; } = string.Empty;

        /// <summary>Number value (0 for other kinds).</summary>
        public double NumberValue { get; private set; }

        /// <summary>Boolean value (false for other kinds).</summary>
        public bool BooleanValue { get; private set; }

        /// <summary>Array items (empty for other kinds).</summary>
        public IReadOnlyList<JsonNode> Items => (IReadOnlyList<JsonNode>)_items ?? NoItems;

        /// <summary>Object members in file order (empty for other kinds).</summary>
        public IReadOnlyList<KeyValuePair<string, JsonNode>> Members => (IReadOnlyList<KeyValuePair<string, JsonNode>>)_members ?? NoMembers;

        /// <summary>Returns the member with this name, or null (also for non-objects).</summary>
        /// <param name="name">Member name (case-sensitive).</param>
        public JsonNode Get(string name)
        {
            if (_byName == null || name == null)
            {
                return null;
            }

            return _byName.TryGetValue(name, out JsonNode value) ? value : null;
        }

        /// <summary>True if the object has a member with this name.</summary>
        /// <param name="name">Member name.</param>
        public bool Has(string name)
        {
            return _byName != null && name != null && _byName.ContainsKey(name);
        }

        /// <summary>Creates a null value.</summary>
        /// <param name="line">Line.</param>
        public static JsonNode CreateNull(int line)
        {
            return new JsonNode(JsonNodeKind.Null, line);
        }

        /// <summary>Creates a boolean value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="line">Line.</param>
        public static JsonNode CreateBoolean(bool value, int line)
        {
            return new JsonNode(JsonNodeKind.Boolean, line) { BooleanValue = value };
        }

        /// <summary>Creates a number value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="line">Line.</param>
        public static JsonNode CreateNumber(double value, int line)
        {
            return new JsonNode(JsonNodeKind.Number, line) { NumberValue = value };
        }

        /// <summary>Creates a string value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="line">Line.</param>
        public static JsonNode CreateString(string value, int line)
        {
            return new JsonNode(JsonNodeKind.String, line) { StringValue = value ?? string.Empty };
        }

        /// <summary>Creates an empty array.</summary>
        /// <param name="line">Line.</param>
        public static JsonNode CreateArray(int line)
        {
            return new JsonNode(JsonNodeKind.Array, line);
        }

        /// <summary>Creates an empty object.</summary>
        /// <param name="line">Line.</param>
        public static JsonNode CreateObject(int line)
        {
            return new JsonNode(JsonNodeKind.Object, line);
        }

        /// <summary>Appends an item to an array.</summary>
        /// <param name="item">Item.</param>
        /// <exception cref="InvalidOperationException">This node is not an array.</exception>
        public void AddItem(JsonNode item)
        {
            if (_items == null)
            {
                throw new InvalidOperationException("Not an array.");
            }

            _items.Add(item ?? throw new ArgumentNullException(nameof(item)));
        }

        /// <summary>Adds a member to an object. Returns false if the name exists already.</summary>
        /// <param name="name">Member name.</param>
        /// <param name="value">Value.</param>
        /// <exception cref="InvalidOperationException">This node is not an object.</exception>
        public bool TryAddMember(string name, JsonNode value)
        {
            if (_byName == null)
            {
                throw new InvalidOperationException("Not an object.");
            }

            if (name == null || value == null || _byName.ContainsKey(name))
            {
                return false;
            }

            _byName.Add(name, value);
            _members.Add(new KeyValuePair<string, JsonNode>(name, value));
            return true;
        }
    }
}
