using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>The save file format (architecture 9.3): JSON layout, determinism, GZip, defensive parsing.</summary>
    [TestFixture]
    public sealed class SaveDocumentCodecTests
    {
        public sealed class KindDto
        {
            public SaveKind Kind;
            public Dictionary<string, int> Counts = new Dictionary<string, int>();
        }

        private readonly SaveDocumentCodec _codec = new SaveDocumentCodec();
        private readonly Dictionary<string, Type> _types = new Dictionary<string, Type> { { "counter", typeof(CounterDto) }, { "kinds", typeof(KindDto) } };

        private static SaveSnapshot CreateSnapshot()
        {
            var header = new SaveHeader { SlotId = "char_01/manual_001", Kind = "manual", CreatedUtc = "2026-10-13T18:30:00Z", PlaytimeSeconds = 12.5 };
            var snapshot = new SaveSnapshot(header);
            snapshot.Add("counter", new CounterDto { Value = 7, Name = "Liara", Tags = new List<string> { "x" } });
            snapshot.Add("kinds", new KindDto { Kind = SaveKind.Quick, Counts = new Dictionary<string, int> { { "Flag.Mixed_Case", 3 } } });
            return snapshot;
        }

        [Test]
        public void EncodeDecode_RoundTripsTheSections()
        {
            byte[] bytes = _codec.Encode(CreateSnapshot(), false, true);

            SaveSnapshot decoded = _codec.Decode(bytes, _types);

            Assert.That(decoded.Header.SlotId, Is.EqualTo("char_01/manual_001"));
            Assert.That(decoded.Header.PlaytimeSeconds, Is.EqualTo(12.5));
            Assert.That(decoded.TryGet("counter", out object counter), Is.True);
            Assert.That(((CounterDto)counter).Value, Is.EqualTo(7));
            Assert.That(((CounterDto)counter).Tags, Is.EqualTo(new[] { "x" }));
            Assert.That(decoded.TryGet("kinds", out object kinds), Is.True);
            Assert.That(((KindDto)kinds).Kind, Is.EqualTo(SaveKind.Quick));
            Assert.That(((KindDto)kinds).Counts["Flag.Mixed_Case"], Is.EqualTo(3));
        }

        [Test]
        public void Json_UsesCamelCaseNamesEnumNamesAndKeepsDictionaryKeys()
        {
            string text = _codec.EncodeToText(CreateSnapshot(), true);

            Assert.That(text, Does.Contain("\"header\": {"));
            Assert.That(text, Does.Contain("\"sections\": {"));
            Assert.That(text, Does.Contain("\"format\": \"aetherfall-save\""));
            Assert.That(text, Does.Contain("\"saveVersion\": 1"));
            Assert.That(text, Does.Contain("\"value\": 7"));
            Assert.That(text, Does.Contain("\"kind\": \"quick\""), "enums as names");
            Assert.That(text, Does.Contain("\"Flag.Mixed_Case\": 3"), "dictionary keys unchanged");
            Assert.That(text, Does.Not.Contain("$type"));
            Assert.That(text, Does.Not.Contain("\r"), "LF line ends on every platform");
            Assert.That(text.EndsWith("\n", StringComparison.Ordinal), Is.True);
        }

        [Test]
        public void RawSection_IsWrittenUnchanged_AndCanBeDecodedLater()
        {
            string original = _codec.EncodeToText(CreateSnapshot(), true);
            JObject root = _codec.ParseDocument(Encoding.UTF8.GetBytes(original));
            JToken kept = root[SaveFormat.SectionsKey]["counter"].DeepClone();
            SaveSnapshot decoded = _codec.ToSnapshot(root, new Dictionary<string, Type> { { "kinds", typeof(KindDto) } });
            decoded.TryGet("kinds", out object kinds);

            var again = new SaveSnapshot(decoded.Header);
            again.AddRaw("counter", kept);
            again.Add("kinds", kinds);

            Assert.That(_codec.EncodeToText(again, true), Is.EqualTo(original), "a section without saveable keeps its bytes");
            Assert.That(kept.Parent, Is.Null, "the kept JSON is copied, never moved into the document");
            var counter = (CounterDto)_codec.ToSectionData("counter", kept, typeof(CounterDto));
            Assert.That(counter.Value, Is.EqualTo(7));
            Assert.That(counter.Name, Is.EqualTo("Liara"));
            Assert.Throws<InvalidDataException>(() => _codec.ToSectionData("kinds", new JArray(1, 2), typeof(KindDto)));
        }

        [Test]
        public void Encode_IsDeterministic()
        {
            Assert.That(_codec.EncodeToText(CreateSnapshot(), true), Is.EqualTo(_codec.EncodeToText(CreateSnapshot(), true)));
        }

        [Test]
        public void Compressed_StartsWithGZipMagicBytes_AndLoads()
        {
            byte[] bytes = _codec.Encode(CreateSnapshot(), true, false);

            Assert.That(SaveCompression.IsGZip(bytes), Is.True);
            Assert.That(bytes[0], Is.EqualTo(0x1F));
            Assert.That(bytes[1], Is.EqualTo(0x8B));
            SaveSnapshot decoded = _codec.Decode(bytes, _types);
            Assert.That(decoded.TryGet("counter", out object counter) && ((CounterDto)counter).Value == 7, Is.True);
        }

        [TestCase("")]
        [TestCase("[1, 2]")]
        [TestCase("{ \"header\": ")]
        [TestCase("{ \"sections\": {} }")]
        [TestCase("{ \"header\": {} } trailing")]
        public void InvalidFiles_AreRejectedWithInvalidDataException(string text)
        {
            Assert.Throws<InvalidDataException>(() => _codec.Decode(Encoding.UTF8.GetBytes(text), _types));
        }

        [Test]
        public void TypeNamesInTheFile_AreNeverEvaluated()
        {
            const string json = "{ \"header\": { \"$type\": \"System.IO.FileInfo, mscorlib\", \"slotId\": \"char_01/x\" }, " +
                                "\"sections\": { \"counter\": { \"$type\": \"System.Diagnostics.Process, System\", \"value\": 3 } } }";

            SaveSnapshot decoded = _codec.Decode(Encoding.UTF8.GetBytes(json), _types);

            Assert.That(decoded.TryGet("counter", out object counter), Is.True);
            Assert.That(counter, Is.TypeOf<CounterDto>());
            Assert.That(((CounterDto)counter).Value, Is.EqualTo(3));
        }

        [Test]
        public void UnknownSections_AreSkippedAndListed()
        {
            const string json = "{ \"header\": {}, \"sections\": { \"counter\": { \"value\": 1 }, \"housing\": { \"rooms\": 3 } } }";
            var unknown = new List<string>();

            SaveSnapshot decoded = _codec.ToSnapshot(_codec.ParseDocument(Encoding.UTF8.GetBytes(json)), _types, unknown);

            Assert.That(unknown, Is.EqualTo(new[] { "housing" }));
            Assert.That(decoded.TryGet("housing", out _), Is.False);
            Assert.That(decoded.TryGet("counter", out _), Is.True);
        }

        [Test]
        public void SectionWithTheWrongShape_IsReportedAsInvalidData()
        {
            const string json = "{ \"header\": {}, \"sections\": { \"counter\": { \"value\": \"not a number\" } } }";

            Assert.Throws<InvalidDataException>(() => _codec.Decode(Encoding.UTF8.GetBytes(json), _types));
        }

        [Test]
        public void HeaderFile_RoundTripsWithChecksum()
        {
            var header = new SaveHeader { SlotId = "char_01/quick_1", Kind = "quick", Sha256 = "abc123", Compressed = true };

            SaveHeader decoded = _codec.DecodeHeader(_codec.EncodeHeader(header));

            Assert.That(decoded.SlotId, Is.EqualTo("char_01/quick_1"));
            Assert.That(decoded.Sha256, Is.EqualTo("abc123"));
            Assert.That(decoded.Compressed, Is.True);
            Assert.That(decoded.Character, Is.Not.Null);
        }

        [Test]
        public void Checksum_IsLowercaseSha256Hex()
        {
            Assert.That(SaveChecksum.Sha256Hex(Encoding.ASCII.GetBytes("abc")),
                Is.EqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
        }

        [Test]
        public void JsonFacade_RejectsNonDtoTypes()
        {
            var json = new NewtonsoftJsonSerializer();
            string text = json.Serialize(new CounterDto { Value = 5 }, false);

            Assert.That(text, Does.Contain("\"value\":5"));
            Assert.That(json.Deserialize<CounterDto>(text).Value, Is.EqualTo(5));
            Assert.Throws<ArgumentException>(() => json.Serialize(new Dictionary<string, object>(), false));
            Assert.Throws<ArgumentException>(() => json.Deserialize("{}", typeof(System.IO.FileInfo)));
        }
    }
}
