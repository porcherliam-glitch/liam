using Aetherfall.Events;
using Aetherfall.GameTime;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Calendar of GDD 01 6.1: phases of the day, weekdays, moon, time windows and minutes until an hour.</summary>
    [TestFixture]
    public sealed class GameCalendarTests
    {
        [TestCase(4, DayPhase.Night)]
        [TestCase(5, DayPhase.Morning)]
        [TestCase(7, DayPhase.Morning)]
        [TestCase(8, DayPhase.Day)]
        [TestCase(17, DayPhase.Day)]
        [TestCase(18, DayPhase.Evening)]
        [TestCase(20, DayPhase.Evening)]
        [TestCase(21, DayPhase.Night)]
        [TestCase(0, DayPhase.Night)]
        public void PhasesFollowTheTable(int hour, DayPhase phase)
        {
            Assert.That(GameCalendar.PhaseOf(hour), Is.EqualTo(phase));
        }

        [Test]
        public void WeekAndMoonCountFromDayOne()
        {
            var first = new GameDateTime(1, 10, 0);
            var ninth = new GameDateTime(9, 10, 0);
            var fifth = new GameDateTime(5, 10, 0);

            Assert.That(GameCalendar.WeekdayName(first.Weekday), Is.EqualTo("Erdtag"));
            Assert.That(GameCalendar.WeekdayName(new GameDateTime(7, 0, 0).Weekday), Is.EqualTo("Ruhetag"));
            Assert.That(GameCalendar.WeekdayName(new GameDateTime(8, 0, 0).Weekday), Is.EqualTo("Erdtag"));
            Assert.That(GameCalendar.MoonName(first.MoonDay), Is.EqualTo("Vollmond"));
            Assert.That(GameCalendar.MoonName(fifth.MoonDay), Is.EqualTo("Neumond"));
            Assert.That(ninth.MoonDay, Is.EqualTo(0), "8-day cycle: day 9 is full moon again");
        }

        [Test]
        public void TotalMinutesAndBack()
        {
            GameDateTime moment = GameDateTime.FromTotalMinutes(1440 * 2 + 7 * 60 + 30.9);

            Assert.That(moment.Day, Is.EqualTo(3));
            Assert.That(moment.ClockText, Is.EqualTo("07:30"));
            Assert.That(moment.HourOfDay, Is.EqualTo(7.5).Within(1e-9));
            Assert.That(moment.TotalMinutes, Is.EqualTo(1440 * 2 + 7 * 60 + 30));
            Assert.That(GameDateTime.FromTotalMinutes(-50).Day, Is.EqualTo(1));
        }

        [TestCase(7.0, 7, 18, true)]
        [TestCase(17.99, 7, 18, true)]
        [TestCase(18.0, 7, 18, false)]
        [TestCase(23.0, 21, 5, true)]
        [TestCase(3.0, 21, 5, true)]
        [TestCase(12.0, 21, 5, false)]
        [TestCase(12.0, 0, 0, true)]
        public void WindowsWorkOverMidnight(double hour, int from, int to, bool inside)
        {
            Assert.That(GameCalendar.InWindow(hour, from, to), Is.EqualTo(inside));
        }

        [Test]
        public void MinutesUntilAnHour()
        {
            Assert.That(GameCalendar.MinutesUntil(10 * 60, 12), Is.EqualTo(120.0));
            Assert.That(GameCalendar.MinutesUntil(22 * 60, 6), Is.EqualTo(480.0), "over midnight");
            Assert.That(GameCalendar.MinutesUntil(6 * 60, 6), Is.EqualTo(0.0));
        }

        [Test]
        public void TwoSecondsAreAMinuteAtTheDefaultLength()
        {
            Assert.That(GameCalendar.GameMinutesFor(2.0, GameCalendar.DefaultRealSecondsPerDay), Is.EqualTo(1.0).Within(1e-9));
            Assert.That(GameCalendar.GameMinutesFor(2.0, 0f), Is.EqualTo(1.0).Within(1e-9), "invalid length falls back to 48 min");
        }
    }
}
