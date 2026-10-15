namespace Aetherfall.GameTime
{
    /// <summary>
    /// The game clock (architecture 4.6): day, hour and minute of the world, 48 min of real time per game day by default
    /// (options 24–96 min). It runs while the player plays (Playing, Building) and stands in menus, pauses and full dialogues
    /// (table 4.4). Every new game minute sends <c>TimeOfDayChanged</c>; waiting or sleeping (<see cref="AdvanceHours"/>)
    /// sends one per skipped hour. Saved in section <c>time</c> together with the playtime.
    /// </summary>
    public interface IGameClock
    {
        /// <summary>The current moment.</summary>
        GameDateTime Now { get; }

        /// <summary>Total game minutes (day 1, 0:00 = 0).</summary>
        double TotalGameMinutes { get; }

        /// <summary>Real seconds per game day (default 2880 = 48 min).</summary>
        float RealSecondsPerGameDay { get; }

        /// <summary>True while the clock runs in the current game state.</summary>
        bool IsClockRunning { get; }

        /// <summary>Changes the day length (options; kept inside 24–96 min).</summary>
        /// <param name="realSeconds">Real seconds per game day.</param>
        void SetDayLength(float realSeconds);

        /// <summary>Lets hours pass at once (waiting, sleeping, fast travel): one <c>TimeOfDayChanged</c> per skipped hour.</summary>
        /// <param name="hours">Game hours (above 0, at most 7 days).</param>
        /// <param name="reasonId">Why (log), e.g. <c>rest.bed</c>, <c>travel</c>, <c>debug</c>.</param>
        void AdvanceHours(float hours, string reasonId);
    }
}
