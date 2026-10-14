using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using System.Xml;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens.Dialogue;
using NUnit.Framework;
using DialogueScreenView = Aetherfall.UI.Screens.Dialogue.DialogueScreen;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>
    /// The smaller parts of the dialogue screen: the director that opens the screen while a conversation runs, the typewriter,
    /// the subtitle options, the screen texts and the layout <c>Dialogue.uxml</c> (every element the code looks for exists, every
    /// static label has a text, every class is defined in a style sheet).
    /// </summary>
    [TestFixture]
    public sealed class DialogueScreenPartsTests
    {
        private static readonly Regex QueryRegex = new Regex(@"Q<\w+>\(""([^""]+)""\)", RegexOptions.Compiled);

        [Test]
        public void Director_OpensTheScreenWhileTheSourceShowsSomething()
        {
            using (var log = new LogCapture())
            using (var ui = new UIManager(new InactiveUiCommands(), () => 0d))
            {
                var source = new FakeDialogueScreenSource();
                var screen = new StubScreen();
                var director = new DialogueScreenDirector(ui, screen, source);

                Assert.That(director.Update(), Is.False);
                source.ShowLine("Ulf", 2f, false, "Hallo.");
                Assert.That(director.Update(), Is.True);
                Assert.That(screen.IsOpen, Is.True);
                Assert.That(ui.Top, Is.SameAs(screen));
                source.ShowChoice(-1, false, FakeDialogueScreenSource.Answer("Eins"));
                Assert.That(director.Update(), Is.False, "stays open between line and choice");

                source.Clear();
                Assert.That(director.Update(), Is.True);
                Assert.That(screen.IsOpen, Is.False);
                Assert.That(screen.OpenCount, Is.EqualTo(1));
                Assert.That(screen.CloseCount, Is.EqualTo(1));
            }
        }

        [Test]
        public void Typewriter_RevealsCharacters_AndCompletes()
        {
            var typewriter = new DialogueTypewriter();
            typewriter.Start("Hallo");

            Assert.That(typewriter.VisibleText, Is.Empty);
            Assert.That(typewriter.Tick(0.05f, 40f), Is.True);
            Assert.That(typewriter.VisibleText, Is.EqualTo("Ha"));
            Assert.That(typewriter.Tick(0.001f, 40f), Is.False, "no new character");
            Assert.That(typewriter.Complete(), Is.True);
            Assert.That(typewriter.VisibleText, Is.EqualTo("Hallo"));
            Assert.That(typewriter.Complete(), Is.False);
            typewriter.Start("Neu");
            Assert.That(typewriter.Tick(0.01f, float.PositiveInfinity), Is.True);
            Assert.That(typewriter.IsComplete, Is.True);
        }

        [Test]
        public void Preferences_TextSpeeds_AndReadingFactor()
        {
            var preferences = new DialogueScreenPreferences();
            int changes = 0;
            preferences.Changed += () => changes++;

            Assert.That(preferences.TextSpeed, Is.EqualTo(DialogueTextSpeed.Fast));
            Assert.That(DialogueScreenPreferences.CharactersPerSecond(DialogueTextSpeed.Slow), Is.EqualTo(20f));
            Assert.That(DialogueScreenPreferences.CharactersPerSecond(DialogueTextSpeed.Normal), Is.EqualTo(40f));
            Assert.That(DialogueScreenPreferences.CharactersPerSecond(DialogueTextSpeed.Fast), Is.EqualTo(80f));
            Assert.That(float.IsPositiveInfinity(DialogueScreenPreferences.CharactersPerSecond(DialogueTextSpeed.Instant)), Is.True);

            preferences.SetAutoContinue(true, 7f);
            Assert.That(preferences.ReadingFactor, Is.EqualTo(3f), "reading factor 1-3 (GDD 05 2.4)");
            preferences.SetTextSpeed(DialogueTextSpeed.Fast);
            Assert.That(changes, Is.EqualTo(1), "setting the same speed changes nothing");
        }

        [Test]
        public void Texts_HaveNoEmptyEntries_AndUniqueKeys()
        {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (UiTextEntry entry in DialogueScreenTexts.All)
            {
                Assert.That(keys.Add(entry.Key), Is.True, "duplicate key " + entry.Key);
                Assert.That(entry.Text, Is.Not.Empty, entry.Key);
            }

            Assert.That(DialogueScreenTexts.Get(DialogueScreenTexts.HintContinue), Is.EqualTo("Weiter"));
            Assert.That(DialogueScreenTexts.Get(DialogueScreenTexts.HintSelect), Is.EqualTo("Auswählen"));
        }

        [Test]
        public void Layout_HasEveryElementTheScreenLooksFor()
        {
            XmlDocument layout = LoadLayout();
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (XmlElement element in layout.GetElementsByTagName("*"))
            {
                string name = element.GetAttribute("name");
                if (name.Length > 0)
                {
                    Assert.That(names.Add(name), Is.True, "duplicate element name " + name);
                }
            }

            foreach (Match match in QueryRegex.Matches(File.ReadAllText(ProjectFile("Scripts/UI/Screens/Dialogue/DialogueScreen.cs"))))
            {
                Assert.That(names, Does.Contain(match.Groups[1].Value));
            }

            foreach (string single in new[]
                     {
                         DialogueScreenView.SpeakerClass, DialogueScreenView.TextClass, DialogueScreenView.ContinueClass, DialogueScreenView.AutoClass,
                         DialogueScreenView.ActionHintClass, DialogueScreenView.EndHintClass
                     })
            {
                Assert.That(WithClass(layout.DocumentElement, single).Count, Is.EqualTo(1), "exactly one element with class " + single);
            }

            List<XmlElement> rows = WithClass(layout.DocumentElement, DialogueScreenView.OptionClass);
            Assert.That(rows.Count, Is.EqualTo(DialogueScreenPresenter.MaxOptions), "one answer row per possible answer (hub: 9)");
            foreach (XmlElement row in rows)
            {
                Assert.That(row.Name, Is.EqualTo("ui:Button"));
                Assert.That(row.GetAttribute("name"), Is.Empty, "answer rows are found by class, their texts are set by code");
                foreach (string part in new[] { DialogueScreenView.SymbolClass, DialogueScreenView.TagClass, DialogueScreenView.OptionTextClass, "af-button__hold-fill" })
                {
                    Assert.That(WithClass(row, part).Count, Is.EqualTo(1), "answer row part " + part);
                }
            }
        }

        [Test]
        public void Layout_NamedLabelsHaveAUiText_UnnamedOnesAreFilledByTheCode()
        {
            // Same rule as UiAssetTests.StaticLabels_HaveATextEntry (EditModeUI) plus: every unnamed label is one the screen fills.
            var filledByCode = new HashSet<string>(StringComparer.Ordinal)
            {
                DialogueScreenView.SpeakerClass, DialogueScreenView.TextClass, DialogueScreenView.ContinueClass, DialogueScreenView.AutoClass,
                DialogueScreenView.ActionHintClass, DialogueScreenView.EndHintClass, DialogueScreenView.SymbolClass, DialogueScreenView.TagClass,
                DialogueScreenView.OptionTextClass
            };
            foreach (XmlElement element in LoadLayout().GetElementsByTagName("*"))
            {
                if (element.Name != "ui:Label" && element.Name != "ui:Button")
                {
                    continue;
                }

                Assert.That(element.HasAttribute("text"), Is.False, "texts belong into UiTexts / DialogueScreenTexts, not into the UXML");
                string name = element.GetAttribute("name");
                if (element.Name == "ui:Button" || GlyphNames.TryParseElementName(name, out _))
                {
                    continue;
                }

                if (name.Length > 0)
                {
                    Assert.That(UiTexts.ForElement(name, out string text), Is.True, "no UiTexts entry for '" + name + "'");
                    Assert.That(text, Is.Not.Empty);
                    continue;
                }

                bool filled = false;
                foreach (string cls in element.GetAttribute("class").Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    filled |= filledByCode.Contains(cls);
                }

                Assert.That(filled, Is.True, "unnamed label with class '" + element.GetAttribute("class") + "' gets no text");
            }

            Assert.That(UiTexts.ForElement("dialogue-hint-hold", out string hold), Is.True);
            Assert.That(hold, Is.EqualTo("Halten = bestätigen"), "shared text hint-hold");
            Assert.That(DialogueScreenTexts.Get(DialogueScreenTexts.HintEnd), Is.EqualTo("Gespräch beenden"));
        }

        [Test]
        public void Layout_UsesOnlyClassesDefinedInTheStyleSheets()
        {
            var defined = new HashSet<string>(StringComparer.Ordinal);
            foreach (string file in Directory.GetFiles(ProjectFile("Art/UI/Styles"), "*.uss"))
            {
                string text = Regex.Replace(File.ReadAllText(file), @"/\*.*?\*/", string.Empty, RegexOptions.Singleline);
                foreach (Match match in Regex.Matches(text, @"\.([a-zA-Z][a-zA-Z0-9_-]*)"))
                {
                    defined.Add(match.Groups[1].Value);
                }
            }

            foreach (XmlElement element in LoadLayout().GetElementsByTagName("*"))
            {
                foreach (string cls in element.GetAttribute("class").Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    Assert.That(defined, Does.Contain(cls), "class '" + cls + "' is not defined in a style sheet");
                }
            }

            string sheet = File.ReadAllText(ProjectFile("Art/UI/Styles/Dialogue.uss"));
            foreach (string cls in new[] { "is-choice", "is-chosen", "is-holding", "af-dialogue__tag--check", "af-dialogue__tag--kill", "af-dialogue__symbol--progress" })
            {
                Assert.That(sheet, Does.Contain("." + cls), "state class used by DialogueScreen");
            }
        }

        private static List<XmlElement> WithClass(XmlElement root, string cls)
        {
            var result = new List<XmlElement>();
            foreach (XmlElement element in root.GetElementsByTagName("*"))
            {
                if (Array.IndexOf(element.GetAttribute("class").Split(' '), cls) >= 0)
                {
                    result.Add(element);
                }
            }

            return result;
        }

        private static XmlDocument LoadLayout()
        {
            var document = new XmlDocument();
            document.Load(ProjectFile("Art/UI/Layouts/Dialogue.uxml"));
            return document;
        }

        private static string ProjectFile(string relativePath, [CallerFilePath] string sourceFile = "")
        {
            // Source file: Assets/_Project/Tests/EditModeDialogue/Screen/<file>.cs → three folders up is Assets/_Project.
            string folder = string.IsNullOrEmpty(sourceFile)
                ? null
                : Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile))));
            if (folder == null || !Directory.Exists(Path.Combine(folder, "Art", "UI")))
            {
                folder = Path.Combine(Directory.GetCurrentDirectory(), "Assets", "_Project");
            }

            return Path.Combine(folder, relativePath.Replace('/', Path.DirectorySeparatorChar));
        }
    }
}
