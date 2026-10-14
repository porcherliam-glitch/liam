namespace Aetherfall.Quests
{
    /// <summary>
    /// Whether a quest can be done again (GDD 02, 4.1 "Wiederholbar: nein / taeglich / woechentlich / mit Abklingzeit"). Values
    /// are stored in assets: never renumber.
    /// </summary>
    /// <remarks>
    /// The cool-down runs in hours of active playtime for now (daily = 24 h, weekly = 168 h). TODO (game clock step): daily and
    /// weekly by game days.
    /// </remarks>
    public enum QuestRepeatMode
    {
        /// <summary>Once only (German "nein").</summary>
        Never = 0,

        /// <summary>Daily (German "taeglich").</summary>
        Daily = 1,

        /// <summary>Weekly (German "woechentlich").</summary>
        Weekly = 2,

        /// <summary>After a cool-down in hours (German "mit Abklingzeit").</summary>
        Cooldown = 3
    }
}
