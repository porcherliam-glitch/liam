namespace Aetherfall.WorldState
{
    /// <summary>One entry of the change history (architecture 8.3: the last 200 changes with source).</summary>
    public readonly struct FlagChangeRecord
    {
        /// <summary>Flag id.</summary>
        public readonly string FlagId;

        /// <summary>Value before.</summary>
        public readonly int OldValue;

        /// <summary>Value after.</summary>
        public readonly int NewValue;

        /// <summary>Writer: quest, dialogue, <c>console</c> …</summary>
        public readonly string SourceId;

        /// <summary>Active playtime in seconds.</summary>
        public readonly double Playtime;

        /// <summary>Creates the record.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="oldValue">Old value.</param>
        /// <param name="newValue">New value.</param>
        /// <param name="sourceId">Writer.</param>
        /// <param name="playtime">Playtime.</param>
        public FlagChangeRecord(string flagId, int oldValue, int newValue, string sourceId, double playtime)
        {
            FlagId = flagId ?? string.Empty;
            OldValue = oldValue;
            NewValue = newValue;
            SourceId = sourceId ?? string.Empty;
            Playtime = playtime;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return FlagId + ": " + OldValue + " -> " + NewValue + " (" + SourceId + ")";
        }
    }
}
