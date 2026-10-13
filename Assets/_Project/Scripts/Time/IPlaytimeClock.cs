namespace Aetherfall.GameTime
{
    /// <summary>
    /// Active playtime (architecture 4.6, "aktive Spielzeit": save preview, flag time stamps, telemetry). It runs in the
    /// states of table 4.4 column "Spielzeit-Zaehler" (Playing, Menu, Dialogue, Cutscene, Building) and stops in Boot,
    /// MainMenu, Loading and Paused.
    /// </summary>
    /// <remarks>
    /// First part of the GameTime system. The game clock (<c>IGameClock</c>: day, hour, moon phase, 48 min per day) follows
    /// in a later step and takes over this counter; the save section <c>time</c> keeps its name.
    /// </remarks>
    public interface IPlaytimeClock
    {
        /// <summary>Active playtime in seconds (double: no drift over 300 h).</summary>
        double PlaytimeSeconds { get; }

        /// <summary>True if the counter runs in the current game state.</summary>
        bool IsRunning { get; }
    }
}
