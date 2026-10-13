namespace Aetherfall.Core
{
    /// <summary>
    /// Sole access to the global time scale (architecture 4.4: only the game state manager and this service write
    /// <c>Time.timeScale</c>). Behind an interface so that <see cref="GameStateService"/> stays pure logic.
    /// </summary>
    public interface ITimeScaleService
    {
        /// <summary>Current global time scale (0 = paused, 1 = normal speed).</summary>
        float TimeScale { get; }

        /// <summary>Sets the global time scale. A value of 0 also pauses audio listeners (UI sounds excepted).</summary>
        /// <param name="timeScale">New time scale, 0 to 100. Invalid values are rejected with an error log.</param>
        void SetTimeScale(float timeScale);
    }
}
