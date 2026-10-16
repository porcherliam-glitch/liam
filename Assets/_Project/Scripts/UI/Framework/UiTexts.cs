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
            new UiTextEntry("options-difficulty-label", "Schwierigkeit"),
            new UiTextEntry("mainmenu-class-title", "Wähle deine Klasse"),
            new UiTextEntry("fmt-class-values", "Startwerte: Stärke {0} · Geschick {1} · Intelligenz {2} · Weisheit {3} · Konstitution {4} · Charisma {5}"),
            new UiTextEntry("fmt-hud-arrows", "{0}: {1}  (Mausrad: wechseln)"),
            new UiTextEntry("hud-arrows-default", "Pfeile"),
            new UiTextEntry("fmt-hud-ability-bar", "Leiste {0} von 2"),

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
            new UiTextEntry("pause-info-title", "Letzter Spielstand"),

            // Death screen
            new UiTextEntry("death-title", "Du bist gefallen"),
            new UiTextEntry("death-subtitle", "Dein Weg endet hier nicht."),
            new UiTextEntry("death-load-last", "Letzten Stand laden"),
            new UiTextEntry("death-respawn", "Am Spawnpunkt wiederbeleben"),

            // Journal: quest log and character page (GDD 05 1.3, GDD 02 7), quest tracker and XP bar of the HUD (GDD 05 1.2)
            new UiTextEntry("pause-journal", "Questlog, Charakter & Fähigkeiten"),
            new UiTextEntry("journal-tab-quests", "Questlog"),
            new UiTextEntry("journal-tab-character", "Charakter"),
            new UiTextEntry("journal-tab-skills", "Fähigkeiten"),
            new UiTextEntry("journal-tab-map", "Karte"),
            new UiTextEntry("map-none", "Für diesen Ort gibt es keine Karte."),
            new UiTextEntry("map-legend-place", "Entdeckter Ort"),
            new UiTextEntry("map-legend-viewpoint", "Aussichtspunkt"),
            new UiTextEntry("map-legend-unknown", "Gesehen, noch nicht besucht"),
            new UiTextEntry("map-legend-player", "Du"),
            new UiTextEntry("map-count-places", "Orte entdeckt: {0} / {1}"),
            new UiTextEntry("map-count-viewpoints", "Aussichtspunkte: {0} / {1}"),
            new UiTextEntry("map-count-revealed", "Karte aufgedeckt: {0} %"),
            new UiTextEntry("note-location-discovered", "Ort entdeckt: {0}"),
            new UiTextEntry("note-viewpoint", "Aussichtspunkt {0}: {1} Orte auf der Karte"),
            new UiTextEntry("note-region-discovered", "Region entdeckt: {0}"),
            new UiTextEntry("skills-empty", "Diese Klasse hat noch keinen Skill-Baum."),
            new UiTextEntry("skills-more-up", "▲ weitere"),
            new UiTextEntry("skills-more-down", "▼ weitere"),
            new UiTextEntry("hint-learn", "Lernen"),
            new UiTextEntry("hint-bar", "Auf die Leiste"),
            new UiTextEntry("questlog-cat-main", "Haupt"),
            new UiTextEntry("questlog-cat-faction", "Fraktion"),
            new UiTextEntry("questlog-cat-region", "Region"),
            new UiTextEntry("questlog-cat-side", "Neben"),
            new UiTextEntry("questlog-cat-companion", "Begleiter"),
            new UiTextEntry("questlog-cat-contracts", "Aufträge"),
            new UiTextEntry("questlog-cat-done", "Abgeschlossen"),
            new UiTextEntry("questlog-empty", "Keine Quests in dieser Kategorie."),
            new UiTextEntry("questlog-more-up", "▲ weitere"),
            new UiTextEntry("questlog-more-down", "▼ weitere"),
            new UiTextEntry("character-attributes-title", "Attribute"),
            new UiTextEntry("character-derived-title", "Werte"),
            new UiTextEntry("character-hint", "Bestätigen oder ►: Punkt verteilen · ◄: zurücknehmen, solange das Menü offen ist."),
            new UiTextEntry("hint-subtabs", "Kategorie"),
            new UiTextEntry("hint-track", "Verfolgen an/aus"),
            new UiTextEntry("hint-focus", "Als Fokus"),
            new UiTextEntry("hint-spend", "Punkt verteilen"),
            new UiTextEntry("hint-refund", "Zurücknehmen"),
            new UiTextEntry("quest-category-main", "Hauptquest"),
            new UiTextEntry("quest-category-faction", "Fraktionsquest"),
            new UiTextEntry("quest-category-region", "Regionsquest"),
            new UiTextEntry("quest-category-side", "Nebenquest"),
            new UiTextEntry("quest-category-companion", "Begleiterquest"),
            new UiTextEntry("quest-category-bounty", "Kopfgeld"),
            new UiTextEntry("quest-category-treasure", "Schatzsuche"),
            new UiTextEntry("quest-category-dungeon", "Dungeon"),
            new UiTextEntry("quest-category-craft", "Handwerksquest"),
            new UiTextEntry("quest-category-puzzle", "Rätselquest"),
            new UiTextEntry("quest-category-legendary", "Legendäre Quest"),
            new UiTextEntry("quest-category-daily", "Täglicher Auftrag"),
            new UiTextEntry("quest-category-weekly", "Wöchentlicher Auftrag"),
            new UiTextEntry("quest-category-procedural", "Auftrag"),
            new UiTextEntry("quest-category-event", "Weltereignis"),
            new UiTextEntry("fmt-quest-row-info", "{0} · Stufe {1}"),
            new UiTextEntry("fmt-quest-meta", "{0} · empfohlen ab Stufe {1}"),
            new UiTextEntry("quest-badge-tracked", "Verfolgt"),
            new UiTextEntry("quest-badge-focus", "Fokus"),
            new UiTextEntry("quest-badge-done", "Abgeschlossen"),
            new UiTextEntry("quest-badge-failed", "Gescheitert"),
            new UiTextEntry("quest-section-current", "Aktueller Stand"),
            new UiTextEntry("quest-section-outcome", "Ausgang"),
            new UiTextEntry("quest-section-failed", "Gescheitert"),
            new UiTextEntry("quest-section-history", "Bisher"),
            new UiTextEntry("quest-section-decisions", "Entscheidungen"),
            new UiTextEntry("quest-none-selected", "Wähle links eine Quest aus."),
            new UiTextEntry("fmt-objective-count", "{0}/{1}"),
            new UiTextEntry("fmt-note-quest-main", "Neue Hauptquest: {0}"),
            new UiTextEntry("fmt-note-quest-new", "Neue Quest: {0}"),
            new UiTextEntry("fmt-note-quest-progress", "{0} ({1}/{2})"),
            new UiTextEntry("fmt-note-quest-objective-done", "Erledigt: {0}"),
            new UiTextEntry("fmt-note-quest-stage", "{0}: {1}"),
            new UiTextEntry("fmt-note-quest-bonus", "Bonus: {0}"),
            new UiTextEntry("fmt-note-quest-completed", "Quest abgeschlossen: {0}"),
            new UiTextEntry("fmt-note-quest-failed", "Quest gescheitert: {0}"),
            new UiTextEntry("fmt-note-quest-untracked", "Im Questlog verfolgen: {0}"),
            new UiTextEntry("note-levelup-points", "Neue Punkte – im Charakter-Menü verteilen"),
            new UiTextEntry("fmt-character-level", "Stufe {0}"),
            new UiTextEntry("fmt-character-xp", "{0} / {1} EP"),
            new UiTextEntry("character-xp-max", "Höchststufe erreicht"),
            new UiTextEntry("fmt-character-points", "Freie Attributpunkte: {0} · Freie Skillpunkte: {1}"),
            new UiTextEntry("fmt-attribute-bonus", "+{0}"),
            new UiTextEntry("attr-strength", "Stärke"),
            new UiTextEntry("attr-dexterity", "Geschick"),
            new UiTextEntry("attr-intelligence", "Intelligenz"),
            new UiTextEntry("attr-wisdom", "Weisheit"),
            new UiTextEntry("attr-constitution", "Konstitution"),
            new UiTextEntry("attr-charisma", "Charisma"),
            new UiTextEntry("derived-health", "Max. Lebenspunkte"),
            new UiTextEntry("derived-stamina", "Max. Ausdauer"),
            new UiTextEntry("derived-mana", "Max. Mana"),
            new UiTextEntry("derived-armor", "Rüstung"),
            new UiTextEntry("derived-poise", "Standfestigkeit"),
            new UiTextEntry("derived-crit", "Krit-Chance"),
            new UiTextEntry("derived-carry", "Traglast"),
            new UiTextEntry("fmt-value-kg", "{0} kg"),
            new UiTextEntry("fmt-hud-level", "Stufe {0}"),

            // Trade with a merchant (GDD 04 8.2)
            new UiTextEntry("trade-tab-buy", "Kaufen"),
            new UiTextEntry("trade-tab-sell", "Verkaufen"),
            new UiTextEntry("trade-tab-buyback", "Zurückkaufen"),
            new UiTextEntry("trade-more-up", "▲ weitere"),
            new UiTextEntry("trade-more-down", "▼ weitere"),
            new UiTextEntry("trade-empty-buy", "Der Händler hat gerade nichts mehr. Er füllt alle drei Tage auf."),
            new UiTextEntry("trade-empty-sell", "Nichts in deinem Rucksack, das der Händler kauft."),
            new UiTextEntry("trade-empty-buyback", "Du hast hier noch nichts verkauft."),
            new UiTextEntry("trade-note-buy", "Bestätigen: ein Stück kaufen · Zweite Taste: alle, die du bezahlen kannst."),
            new UiTextEntry("trade-note-sell", "Bestätigen: ein Stück verkaufen · Zweite Taste: den ganzen Stapel. Verkauftes kannst du bis zum Auffüllen zurückkaufen."),
            new UiTextEntry("trade-note-buyback", "Du zahlst genau das, was du bekommen hast."),
            new UiTextEntry("hint-buy", "Kaufen"),
            new UiTextEntry("hint-buy-all", "Alle kaufen"),
            new UiTextEntry("hint-sell", "Verkaufen"),
            new UiTextEntry("hint-sell-all", "Stapel verkaufen"),
            new UiTextEntry("hint-buy-back", "Zurückkaufen"),
            new UiTextEntry("fmt-trade-gold", "Dein Gold: {0}  ·  Gold des Händlers: {1}"),
            new UiTextEntry("fmt-trade-price", "{0} Gold"),
            new UiTextEntry("fmt-trade-price-each", "{0} Gold je Stück"),
            new UiTextEntry("fmt-trade-row-info", "{0} · Stufe {1} · {2}×"),
            new UiTextEntry("fmt-trade-meta", "{0} · Gegenstandsstufe {1} · {2} Stück"),
            new UiTextEntry("fmt-trade-bought", "Gekauft: {0} ×{1} für {2} Gold."),
            new UiTextEntry("fmt-trade-sold", "Verkauft: {0} ×{1} für {2} Gold."),
            new UiTextEntry("fmt-trade-bought-back", "Zurückgekauft: {0}."),
            new UiTextEntry("item-category-weapon", "Waffe"),
            new UiTextEntry("item-category-armor", "Rüstung"),
            new UiTextEntry("item-category-jewelry", "Schmuck"),
            new UiTextEntry("item-category-consumable", "Verbrauchsgut"),
            new UiTextEntry("item-category-material", "Material"),
            new UiTextEntry("item-category-quest", "Questgegenstand"),
            new UiTextEntry("item-category-book", "Buch"),
            new UiTextEntry("item-category-misc", "Sonstiges"),

            // Dice game "Krähenwurf" (GDD 04 10.3)
            new UiTextEntry("dice-rules", "Eine 1 = 100, eine 5 = 50, ein Drilling = Augenzahl × 100 (drei Einsen 1000), die Straße 1–5 = 500. Nach jedem Wurf mindestens einen Punktewürfel beiseitelegen. Ein Wurf ohne Punkte kostet alle Punkte der Runde. Wer zuerst 2000 hat, gewinnt."),
            new UiTextEntry("hint-leave", "Aufstehen"),
            new UiTextEntry("dice-start", "Spiel beginnen"),
            new UiTextEntry("dice-roll", "Würfeln"),
            new UiTextEntry("dice-roll-on", "Beiseitelegen und weiterwürfeln"),
            new UiTextEntry("dice-bank", "Beiseitelegen und sichern"),
            new UiTextEntry("dice-again", "Noch eine Runde"),
            new UiTextEntry("dice-stand-up", "Aufstehen"),
            new UiTextEntry("dice-pick", "Wähle zuerst die Würfel, die du beiseitelegen willst."),
            new UiTextEntry("dice-pick-invalid", "Diese Auswahl bringt keine Punkte: nur Einsen, Fünfen, Drillinge oder die Straße."),
            new UiTextEntry("dice-no-gold", "Dafür reicht dein Gold nicht."),
            new UiTextEntry("dice-opponent", "Gegner"),
            new UiTextEntry("fmt-dice-opponent-aside", "{0} legt Würfel für {1} Punkte beiseite."),
            new UiTextEntry("fmt-dice-opponent-banked", "{0} sichert {1} Punkte."),
            new UiTextEntry("fmt-dice-opponent-bust", "{0} würfelt keinen Punkt und verliert {1} Punkte."),
            new UiTextEntry("dice-stake-note", "Wähle deinen Einsatz mit ◄ ►. Gewinnst du, bekommst du den doppelten Einsatz zurück. Wer mitten im Spiel aufsteht, verliert ihn."),
            new UiTextEntry("fmt-dice-title", "Krähenwurf mit {0}"),
            new UiTextEntry("fmt-dice-gold", "Dein Gold: {0}"),
            new UiTextEntry("fmt-dice-scores", "Du: {0}  ·  {1}: {2}  ·  Ziel: {3}"),
            new UiTextEntry("fmt-dice-turn-player", "Du bist am Zug  ·  Punkte dieser Runde: {0}"),
            new UiTextEntry("fmt-dice-turn-opponent", "{0} ist am Zug  ·  Punkte dieser Runde: {1}"),
            new UiTextEntry("fmt-dice-stake", "◄  Einsatz: {0} Gold  ►"),
            new UiTextEntry("fmt-dice-selection", "Auswahl: {0} Punkte"),
            new UiTextEntry("fmt-dice-won", "Du gewinnst und bekommst {0} Gold!"),
            new UiTextEntry("fmt-dice-lost", "{0} gewinnt. Dein Einsatz ist verloren."),

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
