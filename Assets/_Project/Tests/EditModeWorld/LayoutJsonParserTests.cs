using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>The small JSON reader of the layout files: values, escapes, member order and German errors with line numbers.</summary>
    [TestFixture]
    public sealed class LayoutJsonParserTests
    {
        [Test]
        public void ReadsAllValueKinds()
        {
            JsonNode root = LayoutJsonParser.Parse("{ \"a\": 1.5, \"b\": -2e2, \"c\": \"x\", \"d\": true, \"e\": false, \"f\": null, \"g\": [1, [2]], \"h\": {} }");

            Assert.That(root.Kind, Is.EqualTo(JsonNodeKind.Object));
            Assert.That(root.Get("a").NumberValue, Is.EqualTo(1.5));
            Assert.That(root.Get("b").NumberValue, Is.EqualTo(-200.0));
            Assert.That(root.Get("c").StringValue, Is.EqualTo("x"));
            Assert.That(root.Get("d").BooleanValue, Is.True);
            Assert.That(root.Get("e").Kind, Is.EqualTo(JsonNodeKind.Boolean));
            Assert.That(root.Get("f").Kind, Is.EqualTo(JsonNodeKind.Null));
            Assert.That(root.Get("g").Items.Count, Is.EqualTo(2));
            Assert.That(root.Get("g").Items[1].Items[0].NumberValue, Is.EqualTo(2.0));
            Assert.That(root.Get("h").Members, Is.Empty);
            Assert.That(root.Get("missing"), Is.Null);
        }

        [Test]
        public void KeepsMemberOrder()
        {
            JsonNode root = LayoutJsonParser.Parse("{ \"z\": 1, \"a\": 2, \"m\": 3 }");

            Assert.That(root.Members[0].Key, Is.EqualTo("z"));
            Assert.That(root.Members[1].Key, Is.EqualTo("a"));
            Assert.That(root.Members[2].Key, Is.EqualTo("m"));
        }

        [Test]
        public void DecodesEscapesAndUmlauts()
        {
            JsonNode root = LayoutJsonParser.Parse("{ \"t\": \"Mühle \\\"Brenner\\\"\\n\\u00e4\\/\\\\\" }");

            Assert.That(root.Get("t").StringValue, Is.EqualTo("Mühle \"Brenner\"\nä/\\"));
        }

        [Test]
        public void SkipsByteOrderMark()
        {
            Assert.That(LayoutJsonParser.Parse("﻿[1]").Items.Count, Is.EqualTo(1));
        }

        [TestCase("{ \"a\": 1, }")]
        [TestCase("{ \"a\" 1 }")]
        [TestCase("[1, 2")]
        [TestCase("{ \"a\": 01 }")]
        [TestCase("{ \"a\": tru }")]
        [TestCase("{ \"a\": \"x }")]
        [TestCase("{ \"a\": 1 } x")]
        [TestCase("")]
        public void RejectsInvalidJson(string text)
        {
            Assert.Throws<LayoutFormatException>(() => LayoutJsonParser.Parse(text));
        }

        [Test]
        public void ReportsLineOfTheError()
        {
            var exception = Assert.Throws<LayoutFormatException>(() => LayoutJsonParser.Parse("{\n  \"a\": 1,\n  \"b\": ?\n}"));

            Assert.That(exception.Line, Is.EqualTo(3));
            Assert.That(exception.Message, Does.Contain("Zeile 3"));
        }

        [Test]
        public void RejectsDuplicateNames()
        {
            var exception = Assert.Throws<LayoutFormatException>(() => LayoutJsonParser.Parse("{ \"id\": 1, \"id\": 2 }"));

            Assert.That(exception.Message, Does.Contain("doppelt"));
        }
    }
}
