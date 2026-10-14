using Aetherfall.GameTime;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>Active playtime set by the test (flag time stamps, <c>FlagAge</c>, quest cool-downs).</summary>
    public sealed class FakePlaytimeClock : IPlaytimeClock
    {
        /// <inheritdoc />
        public double PlaytimeSeconds { get; set; }

        /// <inheritdoc />
        public bool IsRunning => true;

        /// <summary>Advances the playtime.</summary>
        /// <param name="hours">Hours of active playtime.</param>
        public void AdvanceHours(double hours)
        {
            PlaytimeSeconds += hours * 3600.0;
        }
    }
}
