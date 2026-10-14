namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Current hour of the day for <see cref="TestHourBetween"/> (stand-in for the game clock of a later step). The test sets
    /// the hour and publishes <c>TimeOfDayChanged</c>.
    /// </summary>
    public sealed class TestDayClock
    {
        /// <summary>Hour 0-23.</summary>
        public int Hour { get; set; } = 12;
    }
}
