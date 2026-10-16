namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Keys of the texts that code sets at run time (formats, states). Static texts use the name of their UXML element as
    /// key and need no constant here. All keys are entries of <see cref="UiTexts"/>.
    /// </summary>
    public static class UiTextKeys
    {
        /// <summary>"{0} · {1}" – info line under "Fortsetzen".</summary>
        public const string ContinueInfo = "fmt-continue-info";

        /// <summary>No save exists.</summary>
        public const string NoSave = "no-save";

        /// <summary>Slot kind manual.</summary>
        public const string SlotKindManual = "slot-kind-manual";

        /// <summary>Slot kind autosave.</summary>
        public const string SlotKindAuto = "slot-kind-auto";

        /// <summary>Slot kind quick save.</summary>
        public const string SlotKindQuick = "slot-kind-quick";

        /// <summary>Slot kind milestone.</summary>
        public const string SlotKindMilestone = "slot-kind-milestone";

        /// <summary>"Spielzeit {0}".</summary>
        public const string SlotPlaytime = "fmt-slot-playtime";

        /// <summary>"{0} – beschaedigt" (damaged slot).</summary>
        public const string SlotDamaged = "fmt-slot-damaged";

        /// <summary>"{0}:{1} h" playtime.</summary>
        public const string Playtime = "fmt-playtime";

        /// <summary>"Version {0}".</summary>
        public const string Version = "fmt-version";

        /// <summary>"{0} %".</summary>
        public const string Percent = "fmt-percent";

        /// <summary>"◄  {0}  ►" value of an option row.</summary>
        public const string OptionValue = "fmt-option-value";

        /// <summary>HUD mode full.</summary>
        public const string HudModeFull = "hud-mode-full";

        /// <summary>HUD mode contextual.</summary>
        public const string HudModeContextual = "hud-mode-contextual";

        /// <summary>HUD mode minimal.</summary>
        public const string HudModeMinimal = "hud-mode-minimal";

        /// <summary>Glyph style automatic.</summary>
        public const string GlyphStyleAuto = "glyph-style-auto";

        /// <summary>Glyph style keyboard.</summary>
        public const string GlyphStyleKeyboard = "glyph-style-keyboard";

        /// <summary>Glyph style Xbox.</summary>
        public const string GlyphStyleXbox = "glyph-style-xbox";

        /// <summary>Glyph style PlayStation.</summary>
        public const string GlyphStylePlayStation = "glyph-style-playstation";

        /// <summary>Glyph style Nintendo.</summary>
        public const string GlyphStyleNintendo = "glyph-style-nintendo";

        /// <summary>Glyph style generic.</summary>
        public const string GlyphStyleGeneric = "glyph-style-generic";

        /// <summary>"Gespeichert: {0}".</summary>
        public const string SaveOk = "fmt-save-ok";

        /// <summary>"Speichert …".</summary>
        public const string SaveBusy = "save-busy";

        /// <summary>"Speichern nicht moeglich: {0}".</summary>
        public const string SaveBlocked = "fmt-save-blocked";

        /// <summary>"Speichern fehlgeschlagen: {0}".</summary>
        public const string SaveFailed = "fmt-save-failed";

        /// <summary>"Laden fehlgeschlagen: {0}".</summary>
        public const string LoadFailed = "fmt-load-failed";

        /// <summary>"{0} ×{1}" item message.</summary>
        public const string NoteItemCount = "fmt-note-item-count";

        /// <summary>"+{0} {1}" currency gain.</summary>
        public const string NoteCurrencyGain = "fmt-note-currency-gain";

        /// <summary>"−{0} {1}" currency loss.</summary>
        public const string NoteCurrencyLoss = "fmt-note-currency-loss";

        /// <summary>"+{0} EP".</summary>
        public const string NoteExperience = "fmt-note-xp";

        /// <summary>"Stufe {0} erreicht!".</summary>
        public const string NoteLevelUp = "fmt-note-levelup";

        /// <summary>"+{0} Gegenstaende" overflow summary.</summary>
        public const string NoteSummary = "fmt-note-summary";

        /// <summary>Saved (manual).</summary>
        public const string NoteSaved = "note-saved";

        /// <summary>Quick save created.</summary>
        public const string NoteSavedQuick = "note-saved-quick";

        /// <summary>Autosave created.</summary>
        public const string NoteSavedAuto = "note-saved-auto";

        /// <summary>Save loaded.</summary>
        public const string NoteLoaded = "note-loaded";

        /// <summary>Save failed.</summary>
        public const string NoteSaveFailed = "note-save-failed";

        /// <summary>Generic loading title.</summary>
        public const string LoadingDefault = "loading-default";

        /// <summary>Empty quick slot.</summary>
        public const string QuickSlotEmpty = "quick-empty";

        /// <summary>Hint while a hold item is focused.</summary>
        public const string HoldHint = "hold-hint";

        /// <summary>Tab name "Questlog" (journal title).</summary>
        public const string JournalQuests = "journal-tab-quests";

        /// <summary>Tab name "Charakter" (journal title).</summary>
        public const string JournalCharacter = "journal-tab-character";

        /// <summary>Tab name "Fähigkeiten" (journal title).</summary>
        public const string JournalSkills = "journal-tab-skills";

        /// <summary>Tab name "Karte" (journal title, first hub tab).</summary>
        public const string JournalMap = "journal-tab-map";

        /// <summary>Map page without a map (crypt).</summary>
        public const string MapNone = "map-none";

        /// <summary>Legend: discovered place.</summary>
        public const string MapLegendPlace = "map-legend-place";

        /// <summary>Legend: viewpoint.</summary>
        public const string MapLegendViewpoint = "map-legend-viewpoint";

        /// <summary>Legend: place seen from a viewpoint, not visited yet.</summary>
        public const string MapLegendUnknown = "map-legend-unknown";

        /// <summary>Legend: target of a tracked quest (gold diamond).</summary>
        public const string MapLegendQuest = "map-legend-quest";

        /// <summary>Legend: the player.</summary>
        public const string MapLegendPlayer = "map-legend-player";

        /// <summary>Counter of discovered places ({0} of {1}).</summary>
        public const string MapCountPlaces = "map-count-places";

        /// <summary>Counter of viewpoints ({0} of {1}).</summary>
        public const string MapCountViewpoints = "map-count-viewpoints";

        /// <summary>Share of the map without fog ({0} %).</summary>
        public const string MapCountRevealed = "map-count-revealed";

        /// <summary>Message: a place was discovered ({0} = name).</summary>
        public const string NoteLocationDiscovered = "note-location-discovered";

        /// <summary>Message: a viewpoint was activated ({0} = name, {1} = places marked).</summary>
        public const string NoteViewpoint = "note-viewpoint";

        /// <summary>Message: a region was entered for the first time ({0} = name).</summary>
        public const string NoteRegionDiscovered = "note-region-discovered";

        /// <summary>Title of the travel list.</summary>
        public const string MapTravelTitle = "map-travel-title";

        /// <summary>No travel point unlocked yet.</summary>
        public const string MapTravelNone = "map-travel-none";

        /// <summary>Travel row ({0} = place, {1} = travel time).</summary>
        public const string MapTravelRow = "map-travel-row";

        /// <summary>Travel row waiting for the second press ({0} = place).</summary>
        public const string MapTravelConfirm = "map-travel-confirm";

        /// <summary>Travel blocked: combat.</summary>
        public const string MapTravelCombat = "map-travel-combat";

        /// <summary>Travel blocked: overloaded.</summary>
        public const string MapTravelOverloaded = "map-travel-overloaded";

        /// <summary>Travel blocked by a save lock ({0} = reason).</summary>
        public const string MapTravelLocked = "map-travel-locked";

        /// <summary>Travel target is where the player stands.</summary>
        public const string MapTravelHere = "map-travel-here";

        /// <summary>No map here (crypt).</summary>
        public const string MapTravelNoMap = "map-travel-nomap";

        /// <summary>Travel target not unlocked.</summary>
        public const string MapTravelUnknown = "map-travel-unknown";

        /// <summary>Footer hint "Reisen" on the map page.</summary>
        public const string HintTravel = "hint-travel";

        /// <summary>Footer hint "Lernen".</summary>
        public const string HintLearn = "hint-learn";

        /// <summary>Footer hint "Auf die Leiste".</summary>
        public const string HintBar = "hint-bar";

        /// <summary>Footer hint "Kategorie".</summary>
        public const string HintSubtabs = "hint-subtabs";

        /// <summary>Footer hint "Verfolgen an/aus".</summary>
        public const string HintTrack = "hint-track";

        /// <summary>Footer hint "Als Fokus".</summary>
        public const string HintFocus = "hint-focus";

        /// <summary>Footer hint "Punkt verteilen".</summary>
        public const string HintSpend = "hint-spend";

        /// <summary>Footer hint "Zuruecknehmen".</summary>
        public const string HintRefund = "hint-refund";

        /// <summary>"{0} · Stufe {1}" second line of a quest row.</summary>
        public const string QuestRowInfo = "fmt-quest-row-info";

        /// <summary>"{0} · empfohlen ab Stufe {1}" meta line of the quest details.</summary>
        public const string QuestMeta = "fmt-quest-meta";

        /// <summary>Badge "Verfolgt".</summary>
        public const string QuestBadgeTracked = "quest-badge-tracked";

        /// <summary>Badge "Fokus".</summary>
        public const string QuestBadgeFocus = "quest-badge-focus";

        /// <summary>Badge "Abgeschlossen".</summary>
        public const string QuestBadgeDone = "quest-badge-done";

        /// <summary>Badge "Gescheitert".</summary>
        public const string QuestBadgeFailed = "quest-badge-failed";

        /// <summary>Section "Aktueller Stand".</summary>
        public const string QuestSectionCurrent = "quest-section-current";

        /// <summary>Section "Ausgang".</summary>
        public const string QuestSectionOutcome = "quest-section-outcome";

        /// <summary>Section "Gescheitert".</summary>
        public const string QuestSectionFailed = "quest-section-failed";

        /// <summary>Section "Bisher" (earlier stages).</summary>
        public const string QuestSectionHistory = "quest-section-history";

        /// <summary>Section "Entscheidungen" (ledger).</summary>
        public const string QuestSectionDecisions = "quest-section-decisions";

        /// <summary>"Waehle links eine Quest aus."</summary>
        public const string QuestNoneSelected = "quest-none-selected";

        /// <summary>"{0}/{1}" objective counter.</summary>
        public const string ObjectiveCount = "fmt-objective-count";

        /// <summary>"Neue Hauptquest: {0}" (P0).</summary>
        public const string NoteQuestMain = "fmt-note-quest-main";

        /// <summary>"Neue Quest: {0}" (P1).</summary>
        public const string NoteQuestNew = "fmt-note-quest-new";

        /// <summary>"{0} ({1}/{2})" objective progress (P1).</summary>
        public const string NoteQuestProgress = "fmt-note-quest-progress";

        /// <summary>"Erledigt: {0}" objective without counter done (P1).</summary>
        public const string NoteQuestObjectiveDone = "fmt-note-quest-objective-done";

        /// <summary>"{0}: {1}" new stage with its first objective (P1).</summary>
        public const string NoteQuestStage = "fmt-note-quest-stage";

        /// <summary>"Bonus: {0}" optional objective done (P1).</summary>
        public const string NoteQuestBonus = "fmt-note-quest-bonus";

        /// <summary>"Quest abgeschlossen: {0}" (P0).</summary>
        public const string NoteQuestCompleted = "fmt-note-quest-completed";

        /// <summary>"Quest gescheitert: {0}" (P0).</summary>
        public const string NoteQuestFailed = "fmt-note-quest-failed";

        /// <summary>"Im Questlog verfolgen: {0}" (P1, tracking limit reached).</summary>
        public const string NoteQuestUntracked = "fmt-note-quest-untracked";

        /// <summary>Hint after a level-up: distribute the new points.</summary>
        public const string NoteLevelUpPoints = "note-levelup-points";

        /// <summary>"Stufe {0}" on the character page.</summary>
        public const string CharacterLevel = "fmt-character-level";

        /// <summary>"{0} / {1} EP".</summary>
        public const string CharacterXp = "fmt-character-xp";

        /// <summary>Max level reached.</summary>
        public const string CharacterXpMax = "character-xp-max";

        /// <summary>"Freie Attributpunkte: {0} · Freie Skillpunkte: {1}".</summary>
        public const string CharacterPoints = "fmt-character-points";

        /// <summary>"+{0}" points distributed while the page is open.</summary>
        public const string AttributeBonus = "fmt-attribute-bonus";

        /// <summary>"{0} kg".</summary>
        public const string ValueKg = "fmt-value-kg";

        /// <summary>"Stufe {0}" next to the XP bar of the HUD.</summary>
        public const string HudLevel = "fmt-hud-level";
    }
}
