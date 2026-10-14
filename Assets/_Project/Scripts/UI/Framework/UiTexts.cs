using System;
using System.Collections.Generic;
using System.Globalization;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The central table of all German UI texts (pure logic). Static texts use the name of their UXML element as key
    /// (<see cref="ForElement"/> fills them automatically); texts set by code use the keys of <see cref="UiTextKeys"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>Localization:</b> this table becomes a String Table (<c>com.unity.localization</c>, architecture 11.17) with the
    /// same keys; only <see cref="TryGet"/> changes. No UI text is written anywhere else (UXML elements carry no text).</para>
    /// <para><b>Shared texts:</b> if an element name has no entry, the part after the first hyphen is tried, so
    /// <c>pause-hint-back</c> and <c>mainmenu-hint-back</c> both use <c>hint-back</c>.</para>
    /// <para>The HTML preview (Tools/Preview/ui) reads the entries of this file, so it shows exactly these texts. Keep the form
    /// <c>new UiTextEntry("key", "text")</c> on one line.</para>
    /// </remarks>
    public static class UiTexts
    {
        private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

        private static readonly UiTextEntry[] Entries =
        {
            // Main menu (GDD 05 1.3)
            new UiTextEntry("mainmenu-title", "Chroniken von Aetherfall"),
            new UiTextEntry("mainmenu-subtitle", "Mini-Slice · Testversion"),
            new UiTextEntry("mainmenu-new-game", "Neues Spiel"),
            new UiTextEntry("mainmenu-continue", "Fortsetzen"),
            new UiTextEntry("mainmenu-load", "Laden"),
            new UiTextEntry("mainmenu-options", "Optionen"),
            new UiTextEntry("mainmenu-quit", "Beenden"),
            new UiTextEntry("mainmenu-back", "Zurück"),
            new UiTextEntry("load-title", "Spielstand laden"),
            new UiTextEntry("load-empty", "Noch keine Spielstände vorhanden."),
            new UiTextEntry("options-title", "Optionen"),
            new UiTextEntry("options-placeholder", "Grafik, Ton, Steuerung und Barrierefreiheit folgen in einem späteren Schritt. Diese Einstellungen gelten bis zum Beenden des Spiels."),
            new UiTextEntry("options-ui-scale-label", "UI-Größe"),
            new UiTextEntry("options-hud-mode-label", "HUD-Anzeige"),
            new UiTextEntry("options-glyphs-label", "Tastensymbole"),

            // Pause menu (GDD 05 1.3, System tab)
            new UiTextEntry("pause-title", "Pause"),
            new UiTextEntry("pause-tab-system", "System"),
            new UiTextEntry("pause-tab-load", "Laden"),
            new UiTextEntry("pause-tab-options", "Optionen"),
            new UiTextEntry("pause-resume", "Fortsetzen"),
            new UiTextEntry("pause-quicksave", "Schnellspeichern"),
            new UiTextEntry("pause-load", "Laden"),
            new UiTextEntry("pause-options", "Optionen"),
            new UiTextEntry("pause-main-menu", "Hauptmenü"),
            new UiTextEntry("pause-quit", "Spiel beenden"),

            // Death screen
            new UiTextEntry("death-title", "Du bist gefallen"),
            new UiTextEntry("death-subtitle", "Dein Weg endet hier nicht."),
            new UiTextEntry("death-load-last", "Letzten Stand laden"),
            new UiTextEntry("death-respawn", "Am Spawnpunkt wiederbeleben"),

            // Loading screen
            new UiTextEntry("loading-title", "Lädt …"),
            new UiTextEntry("loading-tip", "Tipp: Destruktive Aktionen wie „Hauptmenü“ bestätigst du, indem du die Bestätigen-Taste gedrückt hältst."),

            // Footer hints (shared by all menus)
            new UiTextEntry("hint-select", "Auswählen"),
            new UiTextEntry("hint-back", "Zurück"),
            new UiTextEntry("hint-tabs", "Reiter"),
            new UiTextEntry("hint-hold", "Halten = bestätigen"),

            // HUD (GDD 05 1.2)
            new UiTextEntry("hud-target-poise-label", "Haltung"),
            new UiTextEntry("hud-stamina-exhausted", "Erschöpft"),
            new UiTextEntry("hud-compass-n", "N"),
            new UiTextEntry("hud-compass-ne", "NO"),
            new UiTextEntry("hud-compass-e", "O"),
            new UiTextEntry("hud-compass-se", "SO"),
            new UiTextEntry("hud-compass-s", "S"),
            new UiTextEntry("hud-compass-sw", "SW"),
            new UiTextEntry("hud-compass-w", "W"),
            new UiTextEntry("hud-compass-nw", "NW"),
            new UiTextEntry("save-indicator-text", "Speichert …"),

            // Texts set by code (UiTextKeys)
            new UiTextEntry("fmt-continue-info", "{0} · {1}"),
            new UiTextEntry("no-save", "Kein Speicherstand vorhanden"),
            new UiTextEntry("slot-kind-manual", "Manuell gespeichert"),
            new UiTextEntry("slot-kind-auto", "Autospeicherung"),
            new UiTextEntry("slot-kind-quick", "Schnellspeicherung"),
            new UiTextEntry("slot-kind-milestone", "Meilenstein"),
            new UiTextEntry("fmt-slot-playtime", "Spielzeit {0}"),
            new UiTextEntry("fmt-slot-damaged", "{0} – beschädigt"),
            new UiTextEntry("fmt-playtime", "{0}:{1} h"),
            new UiTextEntry("fmt-version", "Version {0}"),
            new UiTextEntry("fmt-percent", "{0} %"),
            new UiTextEntry("fmt-option-value", "◄  {0}  ►"),
            new UiTextEntry("hud-mode-full", "Vollständig"),
            new UiTextEntry("hud-mode-contextual", "Kontextabhängig"),
            new UiTextEntry("hud-mode-minimal", "Minimal"),
            new UiTextEntry("glyph-style-auto", "Automatisch"),
            new UiTextEntry("glyph-style-keyboard", "Tastatur"),
            new UiTextEntry("glyph-style-xbox", "Xbox"),
            new UiTextEntry("glyph-style-playstation", "PlayStation"),
            new UiTextEntry("glyph-style-nintendo", "Nintendo"),
            new UiTextEntry("glyph-style-generic", "Generisch"),
            new UiTextEntry("fmt-save-ok", "Gespeichert: {0}"),
            new UiTextEntry("save-busy", "Speichert …"),
            new UiTextEntry("fmt-save-blocked", "Speichern nicht möglich: {0}"),
            new UiTextEntry("fmt-save-failed", "Speichern fehlgeschlagen: {0}"),
            new UiTextEntry("fmt-load-failed", "Laden fehlgeschlagen: {0}"),
            new UiTextEntry("fmt-note-item-count", "{0} ×{1}"),
            new UiTextEntry("fmt-note-currency-gain", "+{0} {1}"),
            new UiTextEntry("fmt-note-currency-loss", "−{0} {1}"),
            new UiTextEntry("fmt-note-xp", "+{0} EP"),
            new UiTextEntry("fmt-note-levelup", "Stufe {0} erreicht!"),
            new UiTextEntry("fmt-note-summary", "+{0} Gegenstände"),
            new UiTextEntry("note-saved", "Spiel gespeichert"),
            new UiTextEntry("note-saved-quick", "Schnellspeicherung erstellt"),
            new UiTextEntry("note-saved-auto", "Automatisch gespeichert"),
            new UiTextEntry("note-loaded", "Spielstand geladen"),
            new UiTextEntry("note-save-failed", "Speichern fehlgeschlagen"),
            new UiTextEntry("loading-default", "Lädt …"),
            new UiTextEntry("quick-empty", "–"),
            new UiTextEntry("hold-hint", "Gedrückt halten")
        };

        /// <summary>All entries in table order (for tests and tools).</summary>
        public static IReadOnlyList<UiTextEntry> All => Entries;

        /// <summary>Looks up a text.</summary>
        /// <param name="key">Key.</param>
        /// <param name="text">The text, or empty.</param>
        /// <returns>True if the key exists.</returns>
        public static bool TryGet(string key, out string text)
        {
            if (!string.IsNullOrEmpty(key))
            {
                for (int i = 0; i < Entries.Length; i++)
                {
                    if (string.Equals(Entries[i].Key, key, StringComparison.Ordinal))
                    {
                        text = Entries[i].Text;
                        return true;
                    }
                }
            }

            text = string.Empty;
            return false;
        }

        /// <summary>Returns a text, or the key itself if it is missing (visible in the UI, so missing texts are noticed).</summary>
        /// <param name="key">Key.</param>
        public static string Get(string key)
        {
            return TryGet(key, out string text) ? text : key ?? string.Empty;
        }

        /// <summary>Formats a template text with invariant culture (numbers are formatted by the caller).</summary>
        /// <param name="key">Key of the template.</param>
        /// <param name="args">Values for <c>{0}</c>, <c>{1}</c> ….</param>
        public static string Format(string key, params object[] args)
        {
            return string.Format(Invariant, Get(key), args);
        }

        /// <summary>
        /// Text of a UXML element: the entry with the element name, otherwise the entry with the name after its first hyphen
        /// (shared texts). Returns false for elements without an entry (their text is set by code).
        /// </summary>
        /// <param name="elementName">Element name, e.g. <c>pause-hint-back</c>.</param>
        /// <param name="text">The text, or empty.</param>
        public static bool ForElement(string elementName, out string text)
        {
            if (TryGet(elementName, out text))
            {
                return true;
            }

            int hyphen = string.IsNullOrEmpty(elementName) ? -1 : elementName.IndexOf('-');
            return hyphen > 0 && hyphen < elementName.Length - 1 && TryGet(elementName.Substring(hyphen + 1), out text);
        }
    }
}
