namespace Aetherfall.Core
{
    /// <summary>
    /// The smooth game time for systems below the GameTime assembly (S35 day and night in World): the total game minutes and
    /// whether the clock runs. <c>IGameClock</c> extends it; the GameTime installer registers the clock under both. World
    /// cannot reference GameTime (that assembly needs the Newtonsoft package for its save section, World must compile without
    /// it), so it reads the time through this facade.
    /// </summary>
    public interface IGameTimeSource
    {
        /// <summary>Total game minutes since day 1, 0:00 (fractional, grows smoothly while the clock runs).</summary>
        double TotalGameMinutes { get; }

        /// <summary>True while the clock runs in the current game state (Playing, Building).</summary>
        bool IsClockRunning { get; }
    }
}
