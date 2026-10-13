using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>Configuration of <see cref="SaveManager"/> (filled by <see cref="SaveInstaller"/>, or by tests).</summary>
    public sealed class SaveManagerSettings
    {
        /// <summary>Character folder (until character creation exists: <see cref="SaveFormat.DefaultCharacterId"/>).</summary>
        public string CharacterId { get; set; } = SaveFormat.DefaultCharacterId;

        /// <summary>True = GZip-compressed <c>.sav</c> files (release); false = readable, indented JSON (dev, architecture 9.3).</summary>
        public bool Compress { get; set; }

        /// <summary>Game version written into the header (Player Settings > Version).</summary>
        public string GameVersion { get; set; } = "0.0.0";

        /// <summary>Content version written into the header.</summary>
        public int ContentVersion { get; set; } = SaveFormat.ContentVersion;

        /// <summary>True enables autosaves.</summary>
        public bool AutosaveEnabled { get; set; } = true;

        /// <summary>Autosave interval in seconds of playtime (GDD 05 5.3: 10 min).</summary>
        public float AutosaveIntervalSeconds { get; set; } = AutosaveScheduler.DefaultIntervalSeconds;

        /// <summary>
        /// True: serialization and file access run on a background thread (architecture 9.3). Tests set false to run
        /// everything synchronously.
        /// </summary>
        public bool UseBackgroundThread { get; set; } = true;

        /// <summary>
        /// True: loads switch the game state to Loading and back to Playing (architecture 9.2). Until the scene loader and
        /// the load flow of the World system exist, the save manager does this itself.
        /// </summary>
        public bool ManageGameState { get; set; } = true;

        /// <summary>Clock for header times and file stamps (tests pass a fixed time).</summary>
        public Func<DateTime> UtcNow { get; set; } = () => DateTime.UtcNow;

        /// <summary>Migration chain (default: <see cref="SaveMigrationChain.CreateDefault"/>).</summary>
        public SaveMigrationChain Migrations { get; set; } = SaveMigrationChain.CreateDefault();
    }
}
