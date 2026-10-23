namespace Aetherfall.Events
{
    /// <summary>
    /// The one table of the phases of the day (GDD 01 6.1): Morgen 5–8, Tag 8–18, Abend 18–21, Nacht 21–5. Used by the game
    /// calendar (HUD, NPC routines, barks) and by day and night (light, stealth), so both always agree. Pure logic.
    /// </summary>
    public static class DayPhaseRules
    {
        /// <summary>Phase of the day at an hour.</summary>
        /// <param name="hour">Hour 0 … 23 (other values wrap).</param>
        public static DayPhase Of(int hour)
        {
            hour = ((hour % 24) + 24) % 24;
            if (hour >= 5 && hour < 8)
            {
                return DayPhase.Morning;
            }

            if (hour >= 8 && hour < 18)
            {
                return DayPhase.Day;
            }

            return hour >= 18 && hour < 21 ? DayPhase.Evening : DayPhase.Night;
        }
    }
}
