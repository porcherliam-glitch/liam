using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Xml;
using Aetherfall.Items;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// Checks the UI text assets without Unity: colour tokens equal GDD 05 and the code, the theme imports existing sheets,
    /// UXML is well-formed and uses only classes that a style sheet defines, element names used by the screen code exist in
    /// the UXML, and every static text has an entry in <see cref="UiTexts"/>.
    /// </summary>
    [TestFixture]
    public sealed class UiAssetTests
    {
        private const string StylesFolder = "Art/UI/Styles";
        private const string LayoutsFolder = "Art/UI/Layouts";
        private const string ThemePath = "Art/UI/Theme/AetherfallTheme.tss";

        private static readonly Regex VariableRegex = new Regex(@"--([a-z0-9-]+)\s*:\s*([^;]+);", RegexOptions.Compiled);
        private static readonly Regex ClassRegex = new Regex(@"\.([a-zA-Z][a-zA-Z0-9_-]*)", RegexOptions.Compiled);
        private static readonly Regex QueryRegex = new Regex(@"Q<\w+>\(""([^""]+)""\)", RegexOptions.Compiled);

        [Test]
        public void RarityTokens_AreExactlyTheGddValues_InUssCodeAndItems()
        {
            Dictionary<string, string> tokens = ReadTokens();
            var expected = new Dictionary<string, string>
            {
                { "rarity-common", "#A6A6A6" }, { "rarity-uncommon", "#4CC35A" }, { "rarity-rare", "#3D8BFF" }, { "rarity-epic", "#A855F7" },
                { "rarity-legendary", "#FF8C1A" }, { "rarity-mythic", "#E53935" }, { "rarity-set", "#F2D23C" }
            };
            foreach (KeyValuePair<string, string> pair in expected)
            {
                Assert.That(tokens[pair.Key], Is.EqualTo(pair.Value), "Tokens.uss --" + pair.Key);
            }

            string[] code =
            {
                UiColorTokens.RarityCommon, UiColorTokens.RarityUncommon, UiColorTokens.RarityRare, UiColorTokens.RarityEpic,
                UiColorTokens.RarityLegendary, UiColorTokens.RarityMythic, UiColorTokens.RaritySet
            };
            for (int i = 0; i <= (int)ItemRarity.Set; i++)
            {
                string accent = UiColorTokens.RarityAccent(i);
                Assert.That(code[i], Is.EqualTo(tokens[accent]), "UiColorTokens vs Tokens.uss: " + accent);
                Assert.That(RarityRules.Color((ItemRarity)i).Hex, Is.EqualTo(code[i]), "Items.RarityRules vs UiColorTokens: " + (ItemRarity)i);
            }
        }

        [Test]
        public void FocusAndComparisonTokens_AreTheGddValues()
        {
            Dictionary<string, string> tokens = ReadTokens();
            Assert.That(tokens["ui-focus"], Is.EqualTo(UiColorTokens.UiFocus).And.EqualTo("#FFE8A3"));
            Assert.That(tokens["ui-better"], Is.EqualTo(UiColorTokens.UiBetter));
            Assert.That(tokens["ui-worse"], Is.EqualTo(UiColorTokens.UiWorse));
            Assert.That(tokens["aether"], Is.EqualTo(UiColorTokens.Aether));
            Assert.That(tokens["ui-panel"], Is.EqualTo("rgba(16, 20, 24, 0.8)"), "GDD 05 1.6: #101418 with 80 %");
        }

        [Test]
        public void Theme_ImportsTheDefaultThemeFirst_AndOnlyExistingSheets()
        {
            string theme = ProjectFiles.Read(ThemePath);
            var imports = new List<string>();
            foreach (Match match in Regex.Matches(theme, @"@import\s+url\(""([^""]+)""\)\s*;"))
            {
                imports.Add(match.Groups[1].Value);
            }

            Assert.That(imports.Count, Is.GreaterThan(1));
            Assert.That(imports[0], Is.EqualTo("unity-theme://default"));
            string themeFolder = Path.GetDirectoryName(ProjectFiles.Get(ThemePath));
            for (int i = 1; i < imports.Count; i++)
            {
                string path = Path.GetFullPath(Path.Combine(themeFolder, imports[i]));
                Assert.That(File.Exists(path), Is.True, "imported sheet missing: " + imports[i]);
            }

            foreach (string file in Directory.GetFiles(ProjectFiles.Get(StylesFolder), "*.uss"))
            {
                Assert.That(imports, Does.Contain("../Styles/" + Path.GetFileName(file)), "sheet not imported by the theme: " + Path.GetFileName(file));
            }
        }

        [Test]
        public void UssVariables_UsedAreDefined()
        {
            Dictionary<string, string> tokens = ReadTokens();
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(StylesFolder), "*.uss"))
            {
                foreach (Match match in Regex.Matches(File.ReadAllText(file), @"var\(--([a-z0-9-]+)\)"))
                {
                    Assert.That(tokens.ContainsKey(match.Groups[1].Value), Is.True, Path.GetFileName(file) + " uses undefined --" + match.Groups[1].Value);
                }
            }
        }

        [Test]
        public void Uxml_IsWellFormed_AndUsesOnlyDefinedClasses()
        {
            HashSet<string> defined = DefinedClasses();
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(LayoutsFolder), "*.uxml"))
            {
                var document = new XmlDocument();
                document.Load(file);
                foreach (XmlElement element in document.GetElementsByTagName("*"))
                {
                    string classes = element.GetAttribute("class");
                    foreach (string name in classes.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        Assert.That(defined.Contains(name), Is.True, Path.GetFileName(file) + ": class '" + name + "' is not defined in any USS file");
                    }
                }
            }
        }

        [Test]
        public void Uxml_MenuButtonsAreNotFocusableForUiToolkit()
        {
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(LayoutsFolder), "*.uxml"))
            {
                var document = new XmlDocument();
                document.Load(file);
                foreach (XmlElement element in document.GetElementsByTagName("ui:Button"))
                {
                    Assert.That(element.GetAttribute("focusable"), Is.EqualTo("false"),
                        Path.GetFileName(file) + ": button '" + element.GetAttribute("name") + "' must have focusable=\"false\" (own focus layer, architecture 12)");
                }
            }
        }

        [Test]
        public void MenuItems_UseOnlyTheOwnStateClasses_NotUnityButtonStates()
        {
            // The default theme styles ".unity-button:enabled:hover" and ":active" (specificity 3, beats ".af-button:hover"
            // and also hits items with is-disabled). BindItem removes the class; the look depends only on is-focused and
            // is-disabled, so the own sheets need no hover/pressed rules either.
            string code = File.ReadAllText(Path.Combine(ProjectFiles.ProjectFolder(), "Scripts", "UI", "Framework", "UiElementUtility.cs"));
            StringAssert.Contains("RemoveFromClassList(Button.ussClassName)", code);
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(StylesFolder), "*.uss"))
            {
                string text = Regex.Replace(File.ReadAllText(file), @"/\*.*?\*/", string.Empty, RegexOptions.Singleline);
                foreach (Match block in Regex.Matches(text, @"([^{}]+)\{"))
                {
                    string selector = block.Groups[1].Value.Trim();
                    Assert.That(Regex.IsMatch(selector, @":(hover|active|focus)\b"), Is.False,
                        Path.GetFileName(file) + ": '" + selector + "' styles a pointer state; menu items show the focus with is-focused");
                    Assert.That(selector.Contains("unity-button"), Is.False, Path.GetFileName(file) + ": '" + selector + "' relies on the removed class unity-button");
                }
            }
        }

        [Test]
        public void ScreenCode_QueriesOnlyElementNamesThatExistInTheUxml()
        {
            HashSet<string> names = UxmlNames();
            string screens = Path.Combine(ProjectFiles.ProjectFolder(), "Scripts", "UI", "Screens");
            foreach (string file in Directory.GetFiles(screens, "*.cs"))
            {
                foreach (Match match in QueryRegex.Matches(File.ReadAllText(file)))
                {
                    Assert.That(names.Contains(match.Groups[1].Value), Is.True, Path.GetFileName(file) + " queries '" + match.Groups[1].Value + "', which no UXML defines");
                }
            }
        }

        [Test]
        public void StaticLabels_HaveATextEntry()
        {
            // Labels and buttons whose text is set by code (values, glyphs, names) are listed here; all others need a table entry.
            var dynamicNames = new HashSet<string>(StringComparer.Ordinal)
            {
                "mainmenu-continue-info", "mainmenu-version", "mainmenu-status", "load-status", "slot-kind", "slot-date", "slot-playtime",
                "options-ui-scale-value", "options-hud-mode-value", "options-glyphs-value", "options-ui-scale", "options-hud-mode", "options-glyphs", "options-difficulty", "options-difficulty-value",
                "pause-status", "pause-last-save", "death-load-info", "death-status", "loading-percent", "hud-target-name", "hud-prompt-text", "toast-text",
                "journal-title", "journal-hint-confirm", "journal-hint-secondary", "questlog-detail-title", "questlog-detail-meta", "questlog-detail-description",
                "questlog-detail-stage-title", "questlog-detail-stage", "questlog-detail-history-title", "quest-row-title", "quest-row-info", "quest-row-badge",
                "objective-text", "objective-count", "tracked-title", "journal-line", "attribute-name", "attribute-bonus", "attribute-value", "value-label",
                "value-number", "character-level", "character-xp-text", "character-points", "hud-xp-level",
                "trade-title", "trade-gold", "trade-empty", "trade-detail-title", "trade-detail-meta", "trade-detail-price", "trade-detail-note", "trade-message",
                "trade-hint-confirm", "trade-hint-secondary",
                "dice-title", "dice-scores", "dice-turn", "dice-die-0", "dice-die-1", "dice-die-2", "dice-die-3", "dice-die-4", "dice-action-0",
                "dice-action-1", "dice-event", "hud-ability-1-time", "hud-ability-2-time", "hud-ability-3-time", "hud-ability-4-time",
                "mainmenu-class-0", "mainmenu-class-1", "mainmenu-class-motto", "mainmenu-class-description", "mainmenu-class-values",
                "hud-arrows", "hud-status", "hud-abilities-bar", "hud-ability-1-name", "hud-ability-2-name", "hud-ability-3-name", "hud-ability-4-name",
                "skills-points", "skills-detail-title", "skills-detail-meta", "skills-detail-description", "skills-detail-state", "skills-detail-bar"
            };
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(LayoutsFolder), "*.uxml"))
            {
                var document = new XmlDocument();
                document.Load(file);
                foreach (XmlElement element in document.GetElementsByTagName("*"))
                {
                    if (element.Name != "ui:Label" && element.Name != "ui:Button")
                    {
                        continue;
                    }

                    string name = element.GetAttribute("name");
                    if (name.Length == 0 || dynamicNames.Contains(name) || name.StartsWith("hud-quick-", StringComparison.Ordinal) ||
                        GlyphNames.TryParseElementName(name, out _))
                    {
                        continue;
                    }

                    Assert.That(UiTexts.ForElement(name, out string text), Is.True, Path.GetFileName(file) + ": no text for '" + name + "'");
                    Assert.That(text, Is.Not.Empty);
                    Assert.That(element.HasAttribute("text"), Is.False, Path.GetFileName(file) + ": '" + name + "' has a text in the UXML; texts belong into UiTexts");
                }
            }
        }

        private static Dictionary<string, string> ReadTokens()
        {
            var tokens = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (Match match in VariableRegex.Matches(ProjectFiles.Read(StylesFolder + "/Tokens.uss")))
            {
                tokens[match.Groups[1].Value] = match.Groups[2].Value.Trim();
            }

            return tokens;
        }

        private static HashSet<string> DefinedClasses()
        {
            var classes = new HashSet<string>(StringComparer.Ordinal);
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(StylesFolder), "*.uss"))
            {
                string text = Regex.Replace(File.ReadAllText(file), @"/\*.*?\*/", string.Empty, RegexOptions.Singleline);
                // Only selector parts (before "{"), not values such as 0.15s.
                foreach (Match block in Regex.Matches(text, @"([^{}]+)\{"))
                {
                    foreach (Match match in ClassRegex.Matches(block.Groups[1].Value))
                    {
                        classes.Add(match.Groups[1].Value);
                    }
                }
            }

            return classes;
        }

        private static HashSet<string> UxmlNames()
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (string file in Directory.GetFiles(ProjectFiles.Get(LayoutsFolder), "*.uxml"))
            {
                var document = new XmlDocument();
                document.Load(file);
                foreach (XmlElement element in document.GetElementsByTagName("*"))
                {
                    string name = element.GetAttribute("name");
                    if (name.Length > 0)
                    {
                        names.Add(name);
                    }
                }
            }

            return names;
        }
    }
}
