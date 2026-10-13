using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>Outcome of a load or a new game.</summary>
    public readonly struct LoadResult
    {
        /// <summary>True if every saveable received its state.</summary>
        public readonly bool Success;

        /// <summary>Slot id (empty for a new game).</summary>
        public readonly string SlotId;

        /// <summary>Format version of the file before migration.</summary>
        public readonly int SaveVersion;

        /// <summary>True if the damaged main file was moved away and the backup was loaded.</summary>
        public readonly bool LoadedFromBackup;

        /// <summary>Localization key of the reason (<see cref="SaveReasonKeys"/>) if it failed.</summary>
        public readonly string ReasonKey;

        /// <summary>Technical detail (English, for the log): migrations, warnings, errors.</summary>
        public readonly string Message;

        /// <summary>Time of the result (UTC).</summary>
        public readonly DateTime FinishedUtc;

        /// <summary>Creates a result.</summary>
        /// <param name="success">Success.</param>
        /// <param name="slotId">Slot id.</param>
        /// <param name="saveVersion">Format version of the file.</param>
        /// <param name="loadedFromBackup">True if the backup was used.</param>
        /// <param name="reasonKey">Reason key.</param>
        /// <param name="message">Detail.</param>
        /// <param name="finishedUtc">Time.</param>
        public LoadResult(bool success, string slotId, int saveVersion, bool loadedFromBackup, string reasonKey, string message, DateTime finishedUtc)
        {
            Success = success;
            SlotId = slotId ?? string.Empty;
            SaveVersion = saveVersion;
            LoadedFromBackup = loadedFromBackup;
            ReasonKey = reasonKey ?? string.Empty;
            Message = message ?? string.Empty;
            FinishedUtc = finishedUtc;
        }

        /// <summary>True if this is a real result (default instances mean "nothing loaded yet").</summary>
        public bool HasValue => FinishedUtc != default;

        /// <inheritdoc />
        public override string ToString()
        {
            return Success
                ? "Loaded '" + SlotId + "' (v" + SaveVersion + (LoadedFromBackup ? ", from backup" : string.Empty) + ")" +
                  (Message.Length > 0 ? " - " + Message : string.Empty)
                : "Load '" + SlotId + "' failed [" + ReasonKey + "] " + Message;
        }
    }
}
