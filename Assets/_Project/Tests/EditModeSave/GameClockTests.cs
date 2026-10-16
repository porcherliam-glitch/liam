using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// <see cref="GameClock"/> (architecture 4.6, GDD 01 6.1): the playtime counts in the states of table 4.4 column
    /// "Spielzeit-Zaehler", the game clock only while playing; 48 min per game day, start on day 1 at 10:00; one
    /// <c>TimeOfDayChanged</c> per new game minute and per skipped hour; section <c>time</c> keeps both; header playtime.
    /// </summary>
    [TestFixture]
    public sealed class GameClockTests
    {
        private SaveTestEnvironment _env;
        private GameClock _clock;
        private readonly List<TimeOfDayChanged> _events = new List<TimeOfDayChanged>();
        private readonly List<DayPhaseChanged> _phases = new List<DayPhaseChanged>();

        [SetUp]
        public void SetUp()
        {
            _env = new SaveTestEnvironment();
            _clock = new GameClock(_env.StateService, _env.Bus);
            _events.Clear();
            _phases.Clear();
            _env.Bus.Subscribe<TimeOfDayChanged>(OnTime);
            _env.Bus.Subscribe<DayPhaseChanged>(OnPhase);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Bus.Unsubscribe<TimeOfDayChanged>(OnTime);
            _env.Bus.Unsubscribe<DayPhaseChanged>(OnPhase);
            _env.Dispose();
        }

        private void OnTime(TimeOfDayChanged evt)
        {
            _events.Add(evt);
        }

        private void OnPhase(DayPhaseChanged evt)
        {
            _phases.Add(evt);
        }

        [Test]
        public void TheClockIsTheGameTimeSourceOfDayAndNight()
        {
            IGameTimeSource source = _clock;
            _clock.AdvanceHours(2f, "test");

            Assert.That(source.TotalGameMinutes, Is.EqualTo(_clock.TotalGameMinutes));
            Assert.That(source.IsClockRunning, Is.EqualTo(_clock.IsClockRunning));
        }

        [Test]
        public void CrossingNineInTheEvening_SendsOnePhaseChange()
        {
            _clock.AdvanceHours(10f + 59f / 60f, "test");
            _phases.Clear();

            // Two real seconds are one game minute: 20:59 -> 21:00.
            _clock.Tick(2.5f);

            Assert.That(_phases.Count, Is.EqualTo(1));
            Assert.That(_phases[0].Previous, Is.EqualTo(DayPhase.Evening));
            Assert.That(_phases[0].Current, Is.EqualTo(DayPhase.Night));
            Assert.That(_phases[0].Skipped, Is.False);
        }

        [Test]
        public void ARestOverNight_SendsEachPhaseOnce_AsSkipped()
        {
            _clock.AdvanceHours(12f, "test");
            _phases.Clear();

            _clock.AdvanceHours(10f, "rest.test");

            Assert.That(_clock.Now.ClockText, Is.EqualTo("08:00"));
            Assert.That(_phases.Count, Is.EqualTo(2), "Night -> Morning at 05:00, Morning -> Day at 08:00");
            Assert.That(_phases[0].Current, Is.EqualTo(DayPhase.Morning));
            Assert.That(_phases[1].Current, Is.EqualTo(DayPhase.Day));
            Assert.That(_phases.TrueForAll(p => p.Skipped), Is.True);
        }

        [Test]
        public void LoadingAGame_SendsNoPhaseChange()
        {
            _clock.AdvanceHours(12f, "test");
            object saved = _clock.Save();
            var other = new GameClock(_env.StateService, _env.Bus);
            _phases.Clear();

            other.Load(saved, new LoadContext("slot", 1, false, false, null));
            other.Tick(0.5f);

            Assert.That(_phases, Is.Empty, "the loaded game starts in its phase");
        }

        [Test]
        public void TheCalendarAndDayAndNightShareOnePhaseTable()
        {
            for (int hour = 0; hour < 24; hour++)
            {
                Assert.That(DayPhaseRules.Of(hour), Is.EqualTo(GameCalendar.PhaseOf(hour)), hour + ":00");
            }
        }

        [Test]
        public void Counts_InPlayingAndMenus_NotWhilePaused()
        {
            _clock.Tick(10f);
            _env.StateService.Push(GameState.Menu, "test");
            _clock.Tick(5f);
            _env.StateService.Pop(GameState.Menu);
            _env.StateService.Push(GameState.Paused, "test");
            _clock.Tick(100f);

            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(15.0).Within(1e-6));
            Assert.That(_clock.IsRunning, Is.False);
        }

        [Test]
        public void StartsOnDayOneAtTen()
        {
            GameDateTime now = _clock.Now;

            Assert.That(now.Day, Is.EqualTo(1));
            Assert.That(now.Hour, Is.EqualTo(10));
            Assert.That(now.Minute, Is.EqualTo(0));
            Assert.That(now.Phase, Is.EqualTo(DayPhase.Day));
            Assert.That(_clock.RealSecondsPerGameDay, Is.EqualTo(2880f));
        }

        [Test]
        public void TwoRealSecondsAreOneGameMinute()
        {
            _clock.Tick(2f);
            _clock.Tick(118f);

            Assert.That(_clock.Now.ClockText, Is.EqualTo("11:00"), "120 s = 1 game hour at 48 min per day");
            Assert.That(_events.Count, Is.EqualTo(2), "one event per new game minute (a long frame sends the newest only)");
            Assert.That(_events[1].Hour, Is.EqualTo(11));
            Assert.That(_events[1].Day, Is.EqualTo(0), "the event counts days from 0");
        }

        [Test]
        public void ClockStandsInMenusAndFullDialogues()
        {
            _env.StateService.Push(GameState.Menu, "test");
            _clock.Tick(60f);
            _env.StateService.Pop(GameState.Menu);
            _env.StateService.Push(GameState.Dialogue, "test");
            _clock.Tick(60f);

            Assert.That(_clock.Now.ClockText, Is.EqualTo("10:00"));
            Assert.That(_clock.IsClockRunning, Is.False);
            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(120.0).Within(1e-6), "the playtime runs on");
        }

        [Test]
        public void AdvanceHoursSendsOneEventPerHour()
        {
            _clock.AdvanceHours(3.5f, "rest.test");

            Assert.That(_clock.Now.ClockText, Is.EqualTo("13:30"));
            Assert.That(_events.Count, Is.EqualTo(4), "11:00, 12:00, 13:00 and the end 13:30");
            Assert.That(_events[0].Hour, Is.EqualTo(11));
            Assert.That(_events[3].Minute, Is.EqualTo(30));
        }

        [Test]
        public void AdvanceOverMidnightGoesToTheNextDay()
        {
            _clock.AdvanceHours(16f, "rest.test");

            Assert.That(_clock.Now.Day, Is.EqualTo(2));
            Assert.That(_clock.Now.ClockText, Is.EqualTo("02:00"));
            Assert.That(_clock.Now.Phase, Is.EqualTo(DayPhase.Night));
        }

        [Test]
        public void DayLengthStaysInTheOptionsRange()
        {
            _clock.SetDayLength(100f);
            Assert.That(_clock.RealSecondsPerGameDay, Is.EqualTo(1440f));

            _clock.SetDayLength(99999f);
            Assert.That(_clock.RealSecondsPerGameDay, Is.EqualTo(5760f));
        }

        [Test]
        public void SaveAndLoad_RoundTrip_AndHeader()
        {
            _clock.Tick(754.5f);
            _clock.AdvanceHours(5f, "rest.test");
            SaveManager manager = _env.CreateManager();
            manager.Register(_clock);
            manager.RegisterHeaderContributor(_clock);

            manager.Save(SaveRequest.Quick());
            string time = _clock.Now.ToString();
            _clock.Tick(100f);
            _clock.AdvanceHours(2f, "rest.test");
            manager.Load("char_01/quick_0");

            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(754.5).Within(1e-6));
            Assert.That(_clock.Now.ToString(), Is.EqualTo(time));
            Assert.That(manager.ListSlots(null)[0].Header.PlaytimeSeconds, Is.EqualTo(754.5).Within(1e-6));
            Assert.That(_clock.SaveKey, Is.EqualTo("time"));
            Assert.That(_clock.LoadOrder, Is.EqualTo(10));
            manager.Dispose();
        }

        [Test]
        public void NewGame_StartsAtZeroOnDayOne()
        {
            _clock.Tick(30f);
            _clock.AdvanceHours(30f, "rest.test");

            _clock.Load(null, LoadContext.NewGame);

            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(0.0));
            Assert.That(_clock.Now.Day, Is.EqualTo(1));
            Assert.That(_clock.Now.Hour, Is.EqualTo(10));
        }

        [TestCase(0.0, "0:00:00")]
        [TestCase(3725.0, "1:02:05")]
        [TestCase(85260.4, "23:41:00")]
        public void Format_ShowsHoursMinutesSeconds(double seconds, string expected)
        {
            Assert.That(GameClock.Format(seconds), Is.EqualTo(expected));
        }
    }
}
