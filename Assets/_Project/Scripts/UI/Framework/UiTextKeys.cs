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
    }
}
