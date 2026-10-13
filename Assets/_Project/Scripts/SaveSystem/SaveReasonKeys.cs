using Aetherfall.Core;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Localization keys of save locks and save/load errors (architecture 4.7: <c>IsSaveAllowed(out reasonKey)</c>).
    /// The UI shows the localized text ("Speichern im Kampf nicht moeglich", GDD 05 5.2/5.6); until the localization tables
    /// exist, <see cref="ToGermanText"/> provides the German text for debug tools.
    /// </summary>
    public static class SaveReasonKeys
    {
        /// <summary>A save or load is already running.</summary>
        public const string Busy = "save.blocked.busy";

        /// <summary>Prefix of the state locks; the state name follows in lower case (<c>save.blocked.state.dialogue</c>).</summary>
        public const string StatePrefix = "save.blocked.state.";

        /// <summary>The player is in combat (CombatStateChanged).</summary>
        public const string Combat = "save.blocked.combat";

        /// <summary>The player is falling, jumping or diving (lock set by the Player, architecture 9.8, GDD 05 5.2).</summary>
        public const string Falling = "save.blocked.falling";

        /// <summary>A saveable threw while taking the snapshot.</summary>
        public const string CaptureFailed = "save.error.capture";

        /// <summary>Serialization failed.</summary>
        public const string SerializeFailed = "save.error.serialize";

        /// <summary>Writing the file failed (disk full, no permission).</summary>
        public const string WriteFailed = "save.error.io";

        /// <summary>The written file could not be verified.</summary>
        public const string VerifyFailed = "save.error.verify";

        /// <summary>All manual slots are used.</summary>
        public const string SlotsFull = "save.error.slots_full";

        /// <summary>The slot id is malformed.</summary>
        public const string InvalidSlot = "save.error.invalid_slot";

        /// <summary>The operation was cancelled.</summary>
        public const string Cancelled = "save.error.cancelled";

        /// <summary>The slot does not exist.</summary>
        public const string NotFound = "load.error.not_found";

        /// <summary>The current game state cannot switch to Loading (menus, dialogue, cutscene).</summary>
        public const string LoadState = "load.error.state";

        /// <summary>The save and its backup are damaged.</summary>
        public const string Corrupt = "load.error.corrupt";

        /// <summary>The save comes from a newer game version.</summary>
        public const string NewerVersion = "load.error.newer_version";

        /// <summary>The save is older than the oldest supported version.</summary>
        public const string TooOld = "load.error.too_old";

        /// <summary>A migration failed.</summary>
        public const string MigrationFailed = "load.error.migration";

        /// <summary>There is no quick save to load.</summary>
        public const string NoQuickSave = "load.error.no_quicksave";

        /// <summary>A system threw while loading its section (the other sections were loaded).</summary>
        public const string SectionFailed = "load.error.section";

        /// <summary>Key of the state lock for a game state (<see cref="StatePrefix"/> + state name in lower case).</summary>
        /// <param name="state">Game state in which saving is not allowed.</param>
        /// <remarks>
        /// Constant strings for the known states: the save manager asks every frame (autosave tick), and architecture 13.2
        /// allows no allocation per frame.
        /// </remarks>
        public static string ForState(GameState state)
        {
            switch (state)
            {
                case GameState.Boot: return StatePrefix + "boot";
                case GameState.MainMenu: return StatePrefix + "mainmenu";
                case GameState.Loading: return StatePrefix + "loading";
                case GameState.Playing: return StatePrefix + "playing";
                case GameState.Menu: return StatePrefix + "menu";
                case GameState.Paused: return StatePrefix + "paused";
                case GameState.Dialogue: return StatePrefix + "dialogue";
                case GameState.Cutscene: return StatePrefix + "cutscene";
                case GameState.Building: return StatePrefix + "building";
                default: return StatePrefix + state.ToString().ToLowerInvariant();
            }
        }

        /// <summary>German text of a key for debug tools (placeholder until the localization tables exist).</summary>
        /// <param name="key">Reason key.</param>
        public static string ToGermanText(string key)
        {
            if (string.IsNullOrEmpty(key))
            {
                return string.Empty;
            }

            if (key.StartsWith(StatePrefix, System.StringComparison.Ordinal))
            {
                return "Speichern im aktuellen Spielzustand nicht möglich (" + key.Substring(StatePrefix.Length) + ")";
            }

            switch (key)
            {
                case Busy: return "Es wird gerade gespeichert oder geladen";
                case Combat: return "Speichern im Kampf nicht möglich";
                case Falling: return "Speichern beim Fallen oder Springen nicht möglich";
                case CaptureFailed: return "Speichern fehlgeschlagen: Spielzustand konnte nicht erfasst werden";
                case SerializeFailed: return "Speichern fehlgeschlagen: Daten konnten nicht umgewandelt werden";
                case WriteFailed: return "Speichern fehlgeschlagen: Datei konnte nicht geschrieben werden. Dein vorheriger Stand ist unverändert";
                case VerifyFailed: return "Speichern fehlgeschlagen: Prüfung der Datei misslungen. Dein vorheriger Stand ist unverändert";
                case SlotsFull: return "Alle Speicherplätze sind belegt";
                case InvalidSlot: return "Ungültiger Speicherplatz";
                case Cancelled: return "Abgebrochen";
                case NotFound: return "Speicherstand nicht gefunden";
                case LoadState: return "Laden ist in diesem Spielzustand nicht möglich";
                case Corrupt: return "Speicherstand und Sicherung sind beschädigt";
                case NewerVersion: return "Speicherstand benötigt eine neuere Spielversion";
                case TooOld: return "Speicherstand ist zu alt";
                case MigrationFailed: return "Speicherstand konnte nicht aktualisiert werden";
                case NoQuickSave: return "Keine Schnellspeicherung vorhanden";
                case SectionFailed: return "Ein Teil des Speicherstands konnte nicht geladen werden";
                default: return key;
            }
        }
    }
}
