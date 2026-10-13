using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Converts between <see cref="SaveSnapshot"/> and the bytes of a save file (architecture 9.3):
    /// <c>{ "header": {…}, "sections": { "&lt;key&gt;": {…}, … } }</c>, UTF-8 without BOM, LF line ends, optional GZip.
    /// The output is deterministic (same snapshot = same bytes), which the golden save test relies on.
    /// </summary>
    /// <remarks>
    /// <para>Sections are deserialized only into the DTO types the caller passes (the types of the registered saveables);
    /// each type is checked once with <see cref="SaveDtoValidator"/>. Type names in the file are never evaluated.</para>
    /// <para>Thread-safe for one operation at a time per instance (the save manager never runs two).</para>
    /// </remarks>
    public sealed class SaveDocumentCodec
    {
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

        private readonly JsonSerializer _serializer = JsonSerializer.Create(SaveJsonSettings.Create(false));
        private readonly Dictionary<Type, string> _checkedTypes = new Dictionary<Type, string>();
        private readonly object _lock = new object();

        /// <summary>Encodes a snapshot into the bytes of a <c>.sav</c> file.</summary>
        /// <param name="snapshot">Header and sections.</param>
        /// <param name="compress">True = GZip.</param>
        /// <param name="indented">True = readable, indented JSON.</param>
        public byte[] Encode(SaveSnapshot snapshot, bool compress, bool indented)
        {
            byte[] bytes = Utf8.GetBytes(EncodeToText(snapshot, indented));
            return compress ? SaveCompression.Compress(bytes) : bytes;
        }

        /// <summary>Encodes a snapshot into JSON text (ends with a line feed).</summary>
        /// <param name="snapshot">Header and sections.</param>
        /// <param name="indented">True = readable, indented JSON.</param>
        public string EncodeToText(SaveSnapshot snapshot, bool indented)
        {
            if (snapshot == null)
            {
                throw new ArgumentNullException(nameof(snapshot));
            }

            var sections = new JObject();
            IReadOnlyList<SaveSection> list = snapshot.Sections;
            for (int i = 0; i < list.Count; i++)
            {
                object data = list[i].Data;
                if (data != null)
                {
                    RequireDto(data.GetType());
                }

                sections.Add(list[i].Key, data == null ? JValue.CreateNull() : JToken.FromObject(data, _serializer));
            }

            var root = new JObject
            {
                { SaveFormat.HeaderKey, JToken.FromObject(snapshot.Header, _serializer) },
                { SaveFormat.SectionsKey, sections }
            };
            return Write(root, indented);
        }

        /// <summary>Encodes a header into the bytes of a <c>.head.json</c> file (always indented and uncompressed).</summary>
        /// <param name="header">Header.</param>
        public byte[] EncodeHeader(SaveHeader header)
        {
            if (header == null)
            {
                throw new ArgumentNullException(nameof(header));
            }

            return Utf8.GetBytes(Write(JToken.FromObject(header, _serializer), true));
        }

        /// <summary>Decodes a <c>.head.json</c> file.</summary>
        /// <param name="headBytes">File content.</param>
        /// <exception cref="InvalidDataException">The content is not a header object.</exception>
        public SaveHeader DecodeHeader(byte[] headBytes)
        {
            JObject header = Parse(headBytes);
            return header.ToObject<SaveHeader>(_serializer) ?? throw new InvalidDataException("Empty header.");
        }

        /// <summary>
        /// Parses a <c>.sav</c> file (GZip or plain) into its raw JSON, e.g. for the migration (architecture 9.5).
        /// </summary>
        /// <param name="fileBytes">File content.</param>
        /// <exception cref="InvalidDataException">The content is not valid save JSON.</exception>
        public JObject ParseDocument(byte[] fileBytes)
        {
            JObject root = Parse(fileBytes);
            if (!(root[SaveFormat.HeaderKey] is JObject))
            {
                throw new InvalidDataException("The save has no header object.");
            }

            return root;
        }

        /// <summary>Reads the header of a parsed document.</summary>
        /// <param name="root">Parsed document.</param>
        /// <exception cref="InvalidDataException">The header is missing.</exception>
        public SaveHeader ReadHeader(JObject root)
        {
            if (!(root[SaveFormat.HeaderKey] is JObject header))
            {
                throw new InvalidDataException("The save has no header object.");
            }

            return header.ToObject<SaveHeader>(_serializer) ?? throw new InvalidDataException("Empty header.");
        }

        /// <summary>
        /// Deserializes the sections of a (migrated) document into DTOs. Sections without a type in
        /// <paramref name="sectionTypes"/> are skipped and listed in <paramref name="unknownSections"/>.
        /// </summary>
        /// <param name="root">Parsed and migrated document.</param>
        /// <param name="sectionTypes">Save key → DTO type of the registered saveables.</param>
        /// <param name="unknownSections">Receives the keys without type (optional).</param>
        /// <exception cref="InvalidDataException">The document or a section does not match its DTO.</exception>
        public SaveSnapshot ToSnapshot(JObject root, IReadOnlyDictionary<string, Type> sectionTypes, List<string> unknownSections = null)
        {
            if (sectionTypes == null)
            {
                throw new ArgumentNullException(nameof(sectionTypes));
            }

            var snapshot = new SaveSnapshot(ReadHeader(root));
            JToken sectionsToken = root[SaveFormat.SectionsKey];
            if (sectionsToken == null || sectionsToken.Type == JTokenType.Null)
            {
                return snapshot;
            }

            if (!(sectionsToken is JObject sections))
            {
                throw new InvalidDataException("'sections' is not an object.");
            }

            foreach (JProperty property in sections.Properties())
            {
                if (!sectionTypes.TryGetValue(property.Name, out Type type) || type == null)
                {
                    if (unknownSections != null)
                    {
                        unknownSections.Add(property.Name);
                    }

                    continue;
                }

                RequireDto(type);
                object data;
                try
                {
                    data = property.Value.Type == JTokenType.Null ? null : property.Value.ToObject(type, _serializer);
                }
                catch (JsonException exception)
                {
                    throw new InvalidDataException("Section '" + property.Name + "' does not match " + type.Name + ": " + exception.Message, exception);
                }

                snapshot.Add(property.Name, data);
            }

            return snapshot;
        }

        /// <summary>Parses and deserializes a file without migration (current format only).</summary>
        /// <param name="fileBytes">File content.</param>
        /// <param name="sectionTypes">Save key → DTO type.</param>
        public SaveSnapshot Decode(byte[] fileBytes, IReadOnlyDictionary<string, Type> sectionTypes)
        {
            return ToSnapshot(ParseDocument(fileBytes), sectionTypes);
        }

        private JObject Parse(byte[] fileBytes)
        {
            if (fileBytes == null || fileBytes.Length == 0)
            {
                throw new InvalidDataException("The file is empty.");
            }

            string text;
            try
            {
                byte[] data = SaveCompression.DecompressIfNeeded(fileBytes);
                text = Utf8.GetString(data);
            }
            catch (Exception exception) when (exception is InvalidDataException || exception is DecoderFallbackException || exception is IOException)
            {
                throw new InvalidDataException("The file is not valid UTF-8 or GZip: " + exception.Message, exception);
            }

            if (text.Length > 0 && text[0] == '﻿')
            {
                text = text.Substring(1);
            }

            try
            {
                using (var reader = new JsonTextReader(new StringReader(text)))
                {
                    reader.DateParseHandling = DateParseHandling.None;
                    reader.FloatParseHandling = FloatParseHandling.Double;
                    reader.MaxDepth = SaveJsonSettings.MaxDepth;
                    JToken token = JToken.ReadFrom(reader);
                    if (reader.Read())
                    {
                        throw new InvalidDataException("Unexpected content after the JSON object.");
                    }

                    return token as JObject ?? throw new InvalidDataException("The file does not contain a JSON object.");
                }
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException("The file is not valid JSON: " + exception.Message, exception);
            }
        }

        private void RequireDto(Type type)
        {
            string problem;
            lock (_lock)
            {
                if (!_checkedTypes.TryGetValue(type, out problem))
                {
                    SaveDtoValidator.Validate(type, out problem);
                    _checkedTypes[type] = problem;
                }
            }

            if (problem.Length > 0)
            {
                throw new InvalidDataException("Type " + type.FullName + " is not allowed in save data: " + problem);
            }
        }

        private static string Write(JToken token, bool indented)
        {
            using (var writer = new StringWriter(CultureInfo.InvariantCulture))
            {
                writer.NewLine = "\n";
                using (var json = new JsonTextWriter(writer))
                {
                    json.CloseOutput = false;
                    json.Formatting = indented ? Formatting.Indented : Formatting.None;
                    json.Indentation = 2;
                    json.IndentChar = ' ';
                    token.WriteTo(json);
                }

                writer.Write('\n');
                return writer.ToString();
            }
        }
    }
}
