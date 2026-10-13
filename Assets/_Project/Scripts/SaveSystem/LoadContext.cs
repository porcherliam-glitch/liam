namespace Aetherfall.SaveSystem
{
    /// <summary>Information about the running load, passed to <see cref="ISaveable.Load"/> and <see cref="IPostLoad.OnAfterLoad"/>.</summary>
    public readonly struct LoadContext
    {
        /// <summary>Slot id (<c>char_01/quick_0</c>); empty for a new game.</summary>
        public readonly string SlotId;

        /// <summary>Format version of the file before migration (the DTOs already have the current format).</summary>
        public readonly int SaveVersion;

        /// <summary>True for "new game": every saveable receives null.</summary>
        public readonly bool IsNewGame;

        /// <summary>True if the main file was damaged and the backup (<c>.bak</c>) was loaded.</summary>
        public readonly bool LoadedFromBackup;

        /// <summary>Header of the loaded save (null for a new game).</summary>
        public readonly SaveHeader Header;

        /// <summary>Creates the context.</summary>
        /// <param name="slotId">Slot id.</param>
        /// <param name="saveVersion">Format version of the file.</param>
        /// <param name="isNewGame">True for a new game.</param>
        /// <param name="loadedFromBackup">True if the backup was loaded.</param>
        /// <param name="header">Header or null.</param>
        public LoadContext(string slotId, int saveVersion, bool isNewGame, bool loadedFromBackup, SaveHeader header)
        {
            SlotId = slotId ?? string.Empty;
            SaveVersion = saveVersion;
            IsNewGame = isNewGame;
            LoadedFromBackup = loadedFromBackup;
            Header = header;
        }

        /// <summary>Context of a new game.</summary>
        public static LoadContext NewGame => new LoadContext(string.Empty, SaveFormat.CurrentVersion, true, false, null);
    }
}
