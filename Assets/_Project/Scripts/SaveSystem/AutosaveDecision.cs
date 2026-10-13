namespace Aetherfall.SaveSystem
{
    /// <summary>What <see cref="AutosaveScheduler.Tick"/> asks the save manager to do.</summary>
    public enum AutosaveDecision
    {
        /// <summary>Nothing to do.</summary>
        None = 0,

        /// <summary>Write an autosave now.</summary>
        SaveNow = 1,

        /// <summary>A pending autosave was locked for too long and is dropped (GDD 05 5.3: after 120 s).</summary>
        Discarded = 2
    }
}
