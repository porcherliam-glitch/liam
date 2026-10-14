using System;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// German texts that the dialogue screen sets by code (labels without a name in <c>Dialogue.uxml</c>: continue mark, hints
    /// that change, "Automatisch weiter"). Named labels take their text from <see cref="UiTexts"/> as everywhere (e.g.
    /// <c>dialogue-hint-hold</c> → <c>hint-hold</c>). Kept apart from the central table so this step adds no lines to an
    /// existing file; the localization step moves the entries into the UI String Table (same keys).
    /// </summary>
    /// <remarks>The HTML preview (Tools/Preview/ui) reads these entries too: keep the form <c>new UiTextEntry("key", "text")</c> on one line.</remarks>
    public static class DialogueScreenTexts
    {
        /// <summary>Key of the hint "Weiter" (line mode).</summary>
        public const string HintContinue = "dialogue-hint-continue";

        /// <summary>Key of the hint "Auswaehlen" (choice mode).</summary>
        public const string HintSelect = "dialogue-hint-select";

        /// <summary>Key of the hint "Gespraech beenden" next to the back glyph.</summary>
        public const string HintEnd = "dialogue-hint-end";

        /// <summary>Key of the continue mark.</summary>
        public const string ContinueMark = "dialogue-continue";

        /// <summary>Key of the hint of the automatic continue (on).</summary>
        public const string AutoOn = "dialogue-auto-on";

        /// <summary>Key of the back glyph text for keyboard and mouse (right mouse button, GDD 03 1.5).</summary>
        public const string BackGlyphKeyboard = "dialogue-glyph-back-keyboard";

        private static readonly UiTextEntry[] Entries =
        {
            new UiTextEntry("dialogue-hint-continue", "Weiter"),
            new UiTextEntry("dialogue-hint-select", "Auswählen"),
            new UiTextEntry("dialogue-hint-end", "Gespräch beenden"),
            new UiTextEntry("dialogue-continue", "▼"),
            new UiTextEntry("dialogue-auto-on", "Automatisch weiter"),
            new UiTextEntry("dialogue-glyph-back-keyboard", "RMT")
        };

        /// <summary>All entries in table order.</summary>
        public static UiTextEntry[] All => (UiTextEntry[])Entries.Clone();

        /// <summary>Returns the text of a key; falls back to <see cref="UiTexts"/>.</summary>
        /// <param name="key">Key.</param>
        public static string Get(string key)
        {
            return TryGet(key, out string text) ? text : UiTexts.Get(key);
        }

        /// <summary>Looks up a key of this table.</summary>
        /// <param name="key">Key.</param>
        /// <param name="text">Text.</param>
        public static bool TryGet(string key, out string text)
        {
            for (int i = 0; i < Entries.Length; i++)
            {
                if (string.Equals(Entries[i].Key, key, StringComparison.Ordinal))
                {
                    text = Entries[i].Text;
                    return true;
                }
            }

            text = string.Empty;
            return false;
        }
    }
}
