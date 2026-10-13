namespace Aetherfall.SaveSystem
{
    /// <summary>Result kind of <see cref="SaveMigrationChain.Migrate"/>.</summary>
    public enum MigrationStatus
    {
        /// <summary>The file already has the current version.</summary>
        UpToDate = 0,

        /// <summary>The file was migrated to the current version.</summary>
        Migrated = 1,

        /// <summary>The file comes from a newer game version and is not loaded (GDD 05 5.6).</summary>
        NewerVersion = 2,

        /// <summary>The file is older than the oldest version the chain can migrate.</summary>
        TooOld = 3,

        /// <summary>A migration step threw or a step is missing.</summary>
        Failed = 4
    }
}
