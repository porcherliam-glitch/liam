using UnityEngine.Scripting;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Header of a save (architecture 9.3): format and versions, slot, time, preview data. Stored at the start of the
    /// <c>.sav</c> file and, with the checksum, in the small <c>.head.json</c> file that the slot list reads.
    /// </summary>
    /// <remarks>
    /// DTO (public fields allowed, architecture 9.1). JSON names are camelCase (<c>saveVersion</c>, <c>createdUtc</c> …).
    /// New fields are added at the end with a default; renaming or removing a field needs a migration.
    /// </remarks>
    [Preserve]
    public sealed class SaveHeader
    {
        /// <summary>Always <see cref="SaveFormat.FormatId"/>.</summary>
        public string Format = SaveFormat.FormatId;

        /// <summary>Format version (architecture 9.5).</summary>
        public int SaveVersion = SaveFormat.CurrentVersion;

        /// <summary>Content version (ids).</summary>
        public int ContentVersion = SaveFormat.ContentVersion;

        /// <summary>Game version that wrote the file (Player Settings > Version).</summary>
        public string GameVersion = string.Empty;

        /// <summary>Slot id, e.g. <c>char_01/quick_0</c>.</summary>
        public string SlotId = string.Empty;

        /// <summary>Kind: <c>manual</c>, <c>auto</c>, <c>quick</c>, <c>milestone</c>.</summary>
        public string Kind = "manual";

        /// <summary>Creation time in UTC, ISO 8601 (<see cref="SaveFormat.TimestampFormat"/>).</summary>
        public string CreatedUtc = string.Empty;

        /// <summary>Active playtime in seconds (from GameTime).</summary>
        public double PlaytimeSeconds;

        /// <summary>Character name, level and classes (from Progression).</summary>
        public SaveHeaderCharacter Character = new SaveHeaderCharacter();

        /// <summary>Region and place (from World).</summary>
        public SaveHeaderLocation Location = new SaveHeaderLocation();

        /// <summary>Current main quest (from Quests).</summary>
        public string MainQuestId = string.Empty;

        /// <summary>Difficulty id (<c>normal</c> …).</summary>
        public string Difficulty = "normal";

        /// <summary>New Game Plus cycle.</summary>
        public int NgPlus;

        /// <summary>World tier (endgame).</summary>
        public int WorldTier;

        /// <summary>File name of the preview image; null while there is none (screenshots come later).</summary>
        public string Screenshot;

        /// <summary>True if the <c>.sav</c> file is GZip-compressed.</summary>
        public bool Compressed;

        /// <summary>SHA-256 of the <c>.sav</c> file (only in <c>.head.json</c>; null inside the <c>.sav</c> file).</summary>
        public string Sha256;
    }
}
