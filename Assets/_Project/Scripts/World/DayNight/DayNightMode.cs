namespace Aetherfall.World
{
    /// <summary>Where a scene's day and night happens: outdoors with sun, sky and ambient, or indoors with daylight openings.</summary>
    public enum DayNightMode
    {
        /// <summary>Drives sun and moon, ambient, fog, sky, fires and windows.</summary>
        Outdoor = 0,

        /// <summary>Only the daylight that falls in through openings; the stealth light factor is a constant.</summary>
        Indoor = 1
    }
}
