namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Text speed of the subtitles (GDD 02 12.7, GDD 05 4.2 "Textgeschwindigkeit (§17)"): slow 20, normal 40, fast 80
    /// characters per second, instant. Default: fast. Values may be stored in the options: never renumber.
    /// </summary>
    public enum DialogueTextSpeed
    {
        /// <summary>20 characters per second (German "Langsam").</summary>
        Slow = 0,

        /// <summary>40 characters per second (German "Normal").</summary>
        Normal = 1,

        /// <summary>80 characters per second (German "Schnell", default).</summary>
        Fast = 2,

        /// <summary>The whole page at once (German "Sofort").</summary>
        Instant = 3
    }
}
