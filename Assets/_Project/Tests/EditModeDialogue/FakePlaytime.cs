using Aetherfall.GameTime;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Active playtime for the world state (flag time stamps).</summary>
    public sealed class FakePlaytime : IPlaytimeClock
    {
        /// <inheritdoc />
        public double PlaytimeSeconds { get; set; }

        /// <inheritdoc />
        public bool IsRunning => true;
    }
}
