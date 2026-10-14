namespace Aetherfall.Events
{
    /// <summary>
    /// Part of the game day (architecture 4.3, payload <c>Phase</c> of <see cref="TimeOfDayChanged"/>: Morgen, Tag, Abend,
    /// Nacht). Values may be stored: never renumber.
    /// </summary>
    public enum DayPhase
    {
        /// <summary>Morning (German "Morgen").</summary>
        Morning = 0,

        /// <summary>Day (German "Tag").</summary>
        Day = 1,

        /// <summary>Evening (German "Abend").</summary>
        Evening = 2,

        /// <summary>Night (German "Nacht").</summary>
        Night = 3
    }
}
