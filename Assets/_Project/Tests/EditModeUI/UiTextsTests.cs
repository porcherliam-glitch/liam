using System;
using System.Collections.Generic;
using System.Reflection;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for the central text table <see cref="UiTexts"/>.</summary>
    [TestFixture]
    public sealed class UiTextsTests
    {
        [Test]
        public void Keys_AreUnique_AndTextsNotEmpty()
        {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (UiTextEntry entry in UiTexts.All)
            {
                Assert.That(keys.Add(entry.Key), Is.True, "duplicate key " + entry.Key);
                Assert.That(entry.Text, Is.Not.Empty, entry.Key);
            }
        }

        [Test]
        public void EveryCodeKeyHasAnEntry()
        {
            foreach (FieldInfo field in typeof(UiTextKeys).GetFields(BindingFlags.Public | BindingFlags.Static))
            {
                string key = (string)field.GetValue(null);
                Assert.That(UiTexts.TryGet(key, out _), Is.True, "UiTextKeys." + field.Name + " = '" + key + "' has no text");
            }
        }

        [Test]
        public void ForElement_FallsBackToTheSharedEntry()
        {
            Assert.That(UiTexts.ForElement("mainmenu-title", out string title), Is.True);
            Assert.That(title, Is.EqualTo("Chroniken von Aetherfall"));
            Assert.That(UiTexts.ForElement("pause-hint-back", out string back), Is.True);
            Assert.That(back, Is.EqualTo("Zurück"));
            Assert.That(UiTexts.ForElement("hud-prompt-text", out _), Is.False);
            Assert.That(UiTexts.ForElement(null, out _), Is.False);
        }

        [Test]
        public void Get_MissingKeyReturnsTheKey_AndFormatFillsPlaceholders()
        {
            Assert.That(UiTexts.Get("does-not-exist"), Is.EqualTo("does-not-exist"));
            Assert.That(UiTexts.Format(UiTextKeys.Percent, "42"), Is.EqualTo("42 %"));
            Assert.That(UiTexts.Format(UiTextKeys.LoadFailed, "x"), Is.EqualTo("Laden fehlgeschlagen: x"));
        }

        [Test]
        public void MenuTextsOfTheTask_Exist()
        {
            string[] expected =
            {
                "Neues Spiel", "Fortsetzen", "Laden", "Optionen", "Beenden", "Schnellspeichern", "Hauptmenü", "Spiel beenden",
                "Du bist gefallen", "Letzten Stand laden", "Am Spawnpunkt wiederbeleben", "Chroniken von Aetherfall"
            };
            var texts = new HashSet<string>(StringComparer.Ordinal);
            foreach (UiTextEntry entry in UiTexts.All)
            {
                texts.Add(entry.Text);
            }

            foreach (string text in expected)
            {
                Assert.That(texts.Contains(text), Is.True, text);
            }
        }
    }
}
