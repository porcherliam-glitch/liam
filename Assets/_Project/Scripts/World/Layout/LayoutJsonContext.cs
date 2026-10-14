using System;
using System.Collections.Generic;
using System.Globalization;

namespace Aetherfall.World
{
    /// <summary>
    /// Typed access to the members of parsed layout JSON for <see cref="RegionLayoutReader"/>. Every problem becomes a German
    /// finding in the <see cref="LayoutReport"/> with its JSON path; the caller gets a default value and continues, so one run
    /// lists all mistakes of a file.
    /// </summary>
    internal sealed class LayoutJsonContext
    {
        private readonly LayoutReport _report;

        public LayoutJsonContext(LayoutReport report)
        {
            _report = report;
        }

        public LayoutReport Report => _report;

        public static string Join(string path, string key)
        {
            return string.IsNullOrEmpty(path) ? key : path + "." + key;
        }

        public static string Index(string path, int index)
        {
            return path + "[" + index.ToString(CultureInfo.InvariantCulture) + "]";
        }

        public void Known(JsonNode node, string path, params string[] keys)
        {
            if (node == null || node.Kind != JsonNodeKind.Object)
            {
                return;
            }

            IReadOnlyList<KeyValuePair<string, JsonNode>> members = node.Members;
            for (int i = 0; i < members.Count; i++)
            {
                if (System.Array.IndexOf(keys, members[i].Key) < 0)
                {
                    _report.Warning(Join(path, members[i].Key), "Unbekannter Eintrag „" + members[i].Key + "“ wird ignoriert (Tippfehler?).");
                }
            }
        }

        public JsonNode Object(JsonNode parent, string key, string path, bool required)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                if (required)
                {
                    _report.Error(Join(path, key), "Pflichtfeld fehlt.");
                }

                return null;
            }

            if (node.Kind != JsonNodeKind.Object)
            {
                _report.Error(Join(path, key), "Objekt { … } erwartet.");
                return null;
            }

            return node;
        }

        public IReadOnlyList<JsonNode> Array(JsonNode parent, string key, string path, bool required)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                if (required)
                {
                    _report.Error(Join(path, key), "Pflichtfeld fehlt.");
                }

                return System.Array.Empty<JsonNode>();
            }

            if (node.Kind != JsonNodeKind.Array)
            {
                _report.Error(Join(path, key), "Liste [ … ] erwartet.");
                return System.Array.Empty<JsonNode>();
            }

            return node.Items;
        }

        public bool IsObject(JsonNode node, string path)
        {
            if (node != null && node.Kind == JsonNodeKind.Object)
            {
                return true;
            }

            _report.Error(path, "Objekt { … } erwartet.");
            return false;
        }

        public double Number(JsonNode parent, string key, string path)
        {
            JsonNode node = parent?.Get(key);
            if (node == null)
            {
                _report.Error(Join(path, key), "Pflichtfeld fehlt.");
                return 0.0;
            }

            if (node.Kind != JsonNodeKind.Number)
            {
                _report.Error(Join(path, key), "Zahl erwartet.");
                return 0.0;
            }

            return node.NumberValue;
        }

        public double Number(JsonNode parent, string key, string path, double fallback)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                return fallback;
            }

            if (node.Kind != JsonNodeKind.Number)
            {
                _report.Error(Join(path, key), "Zahl erwartet.");
                return fallback;
            }

            return node.NumberValue;
        }

        public bool TryNumber(JsonNode parent, string key, string path, out double value)
        {
            value = 0.0;
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                return false;
            }

            if (node.Kind != JsonNodeKind.Number)
            {
                _report.Error(Join(path, key), "Zahl erwartet.");
                return false;
            }

            value = node.NumberValue;
            return true;
        }

        public int Integer(JsonNode parent, string key, string path)
        {
            return ToInteger(Number(parent, key, path), Join(path, key));
        }

        public int Integer(JsonNode parent, string key, string path, int fallback)
        {
            return ToInteger(Number(parent, key, path, fallback), Join(path, key));
        }

        public ulong Seed(JsonNode parent, string key, string path)
        {
            double value = Number(parent, key, path);
            if (value < 0.0 || value > 9007199254740991.0 || Math.Floor(value) != value)
            {
                _report.Error(Join(path, key), "Ganze Zahl ab 0 erwartet.");
                return 0UL;
            }

            return (ulong)value;
        }

        public string String(JsonNode parent, string key, string path)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                _report.Error(Join(path, key), "Pflichtfeld fehlt.");
                return string.Empty;
            }

            if (node.Kind != JsonNodeKind.String)
            {
                _report.Error(Join(path, key), "Text in Anführungszeichen erwartet.");
                return string.Empty;
            }

            return node.StringValue;
        }

        public string String(JsonNode parent, string key, string path, string fallback)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                return fallback;
            }

            if (node.Kind != JsonNodeKind.String)
            {
                _report.Error(Join(path, key), "Text in Anführungszeichen erwartet.");
                return fallback;
            }

            return node.StringValue;
        }

        public bool Boolean(JsonNode parent, string key, string path, bool fallback)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                return fallback;
            }

            if (node.Kind != JsonNodeKind.Boolean)
            {
                _report.Error(Join(path, key), "true oder false erwartet.");
                return fallback;
            }

            return node.BooleanValue;
        }

        public LayoutPoint Point(JsonNode parent, string key, string path)
        {
            JsonNode node = parent?.Get(key);
            if (node == null)
            {
                _report.Error(Join(path, key), "Pflichtfeld fehlt ([x, z] in Metern).");
                return default;
            }

            return ToPoint(node, Join(path, key));
        }

        public LayoutPoint Point(JsonNode parent, string key, string path, LayoutPoint fallback)
        {
            JsonNode node = parent?.Get(key);
            return node == null || node.Kind == JsonNodeKind.Null ? fallback : ToPoint(node, Join(path, key));
        }

        public IReadOnlyList<LayoutPoint> Points(JsonNode parent, string key, string path, int minimum, bool required = true)
        {
            JsonNode node = parent?.Get(key);
            string full = Join(path, key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                if (required)
                {
                    _report.Error(full, "Pflichtfeld fehlt (Liste von [x, z]).");
                }

                return System.Array.Empty<LayoutPoint>();
            }

            if (node.Kind != JsonNodeKind.Array)
            {
                _report.Error(full, "Liste von [x, z] erwartet.");
                return System.Array.Empty<LayoutPoint>();
            }

            var points = new List<LayoutPoint>(node.Items.Count);
            for (int i = 0; i < node.Items.Count; i++)
            {
                points.Add(ToPoint(node.Items[i], Index(full, i)));
            }

            if (points.Count < minimum)
            {
                _report.Error(full, "Mindestens " + minimum + " Punkte nötig, gefunden: " + points.Count + ".");
            }

            return points;
        }

        public double[] Numbers(JsonNode parent, string key, string path, int count)
        {
            JsonNode node = parent?.Get(key);
            string full = Join(path, key);
            var values = new double[count];
            if (node == null || node.Kind != JsonNodeKind.Array || node.Items.Count != count)
            {
                _report.Error(full, "Liste mit genau " + count + " Zahlen erwartet.");
                return values;
            }

            for (int i = 0; i < count; i++)
            {
                if (node.Items[i].Kind != JsonNodeKind.Number)
                {
                    _report.Error(Index(full, i), "Zahl erwartet.");
                    continue;
                }

                values[i] = node.Items[i].NumberValue;
            }

            return values;
        }

        public LayoutColor Color(JsonNode parent, string key, string path)
        {
            string text = String(parent, key, path);
            if (!LayoutColor.TryParse(text, out LayoutColor color))
            {
                _report.Error(Join(path, key), "Farbe als \"#RRGGBB\" erwartet, gefunden: \"" + text + "\".");
            }

            return color;
        }

        public T Token<T>(JsonNode parent, string key, string path, KeyValuePair<string, T>[] map)
        {
            string text = String(parent, key, path);
            return Lookup(text, Join(path, key), map);
        }

        public T Token<T>(JsonNode parent, string key, string path, KeyValuePair<string, T>[] map, T fallback)
        {
            JsonNode node = parent?.Get(key);
            if (node == null || node.Kind == JsonNodeKind.Null)
            {
                return fallback;
            }

            return Lookup(String(parent, key, path), Join(path, key), map);
        }

        public T Lookup<T>(string text, string path, KeyValuePair<string, T>[] map)
        {
            for (int i = 0; i < map.Length; i++)
            {
                if (string.Equals(map[i].Key, text, StringComparison.Ordinal))
                {
                    return map[i].Value;
                }
            }

            var allowed = new string[map.Length];
            for (int i = 0; i < map.Length; i++)
            {
                allowed[i] = map[i].Key;
            }

            _report.Error(path, "Unbekannter Wert \"" + text + "\". Erlaubt: " + string.Join(", ", allowed) + ".");
            return map.Length > 0 ? map[0].Value : default;
        }

        private LayoutPoint ToPoint(JsonNode node, string path)
        {
            if (node.Kind != JsonNodeKind.Array || node.Items.Count != 2 || node.Items[0].Kind != JsonNodeKind.Number ||
                node.Items[1].Kind != JsonNodeKind.Number)
            {
                _report.Error(path, "Punkt als [x, z] (zwei Zahlen in Metern) erwartet.");
                return default;
            }

            return new LayoutPoint(node.Items[0].NumberValue, node.Items[1].NumberValue);
        }

        private int ToInteger(double value, string path)
        {
            if (Math.Floor(value) != value || value < int.MinValue || value > int.MaxValue)
            {
                _report.Error(path, "Ganze Zahl erwartet.");
                return 0;
            }

            return (int)value;
        }
    }
}
