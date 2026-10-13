namespace Aetherfall.SaveSystem
{
    /// <summary>Result of <see cref="SaveMigrationChain.Migrate"/>.</summary>
    public readonly struct MigrationOutcome
    {
        /// <summary>What happened.</summary>
        public readonly MigrationStatus Status;

        /// <summary>Version of the file before migration.</summary>
        public readonly int FromVersion;

        /// <summary>Version after migration (equal to <see cref="FromVersion"/> if nothing ran).</summary>
        public readonly int ToVersion;

        /// <summary>Details for the log (notes of the steps or the error).</summary>
        public readonly string Message;

        /// <summary>Creates an outcome.</summary>
        /// <param name="status">Status.</param>
        /// <param name="fromVersion">Version before.</param>
        /// <param name="toVersion">Version after.</param>
        /// <param name="message">Details.</param>
        public MigrationOutcome(MigrationStatus status, int fromVersion, int toVersion, string message)
        {
            Status = status;
            FromVersion = fromVersion;
            ToVersion = toVersion;
            Message = message ?? string.Empty;
        }

        /// <summary>True if the document has the current version now.</summary>
        public bool IsUsable => Status == MigrationStatus.UpToDate || Status == MigrationStatus.Migrated;
    }
}
