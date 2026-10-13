namespace Aetherfall.SaveSystem
{
    /// <summary>Constants of the save file format (architecture 9.3–9.5).</summary>
    public static class SaveFormat
    {
        /// <summary>Value of <c>header.format</c>: identifies an Aetherfall save.</summary>
        public const string FormatId = "aetherfall-save";

        /// <summary>
        /// Current format version (<c>saveVersion</c>, architecture 9.5). Raise it for every incompatible DTO change and add
        /// a migration <c>CurrentVersion − 1 → CurrentVersion</c> to <see cref="SaveMigrationChain.CreateDefault"/>.
        /// </summary>
        public const int CurrentVersion = 1;

        /// <summary>Current content version (<c>contentVersion</c>, drives the id migration table later).</summary>
        public const int ContentVersion = 1;

        /// <summary>Root property of the header.</summary>
        public const string HeaderKey = "header";

        /// <summary>Root property of the sections.</summary>
        public const string SectionsKey = "sections";

        /// <summary>Property of the format version inside the header.</summary>
        public const string SaveVersionKey = "saveVersion";

        /// <summary>Extension of the full save.</summary>
        public const string SaveExtension = ".sav";

        /// <summary>Extension of the header file for the slot list.</summary>
        public const string HeadExtension = ".head.json";

        /// <summary>Suffix of files being written (atomic write, architecture 9.4).</summary>
        public const string TempSuffix = ".tmp";

        /// <summary>Suffix of the previous version of a save.</summary>
        public const string BackupSuffix = ".bak";

        /// <summary>Folder (inside the character folder) for damaged saves, never deleted (architecture 9.4).</summary>
        public const string CorruptFolderName = "Beschaedigt";

        /// <summary>Folder below the save root that holds the character folders.</summary>
        public const string SavesFolderName = "Saves";

        /// <summary>Character id used until character creation exists.</summary>
        public const string DefaultCharacterId = "char_01";

        /// <summary>Format of <c>header.createdUtc</c> (ISO 8601, UTC, seconds).</summary>
        public const string TimestampFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'";
    }
}
