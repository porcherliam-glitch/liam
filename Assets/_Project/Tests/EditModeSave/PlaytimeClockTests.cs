using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// <see cref="PlaytimeClock"/>: counts only in the states of table 4.4 column "Spielzeit-Zaehler", saves section
    /// <c>time</c> and fills the header.
    /// </summary>
    [TestFixture]
    public sealed class PlaytimeClockTests
    {
        private SaveTestEnvironment _env;
        private PlaytimeClock _clock;

        [SetUp]
        public void SetUp()
        {
            _env = new SaveTestEnvironment();
            _clock = new PlaytimeClock(_env.StateService);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
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
        public void SaveAndLoad_RoundTrip_AndHeader()
        {
            _clock.Tick(754.5f);
            SaveManager manager = _env.CreateManager();
            manager.Register(_clock);
            manager.RegisterHeaderContributor(_clock);

            manager.Save(SaveRequest.Quick());
            _clock.Tick(100f);
            manager.Load("char_01/quick_0");

            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(754.5).Within(1e-6));
            Assert.That(manager.ListSlots(null)[0].Header.PlaytimeSeconds, Is.EqualTo(754.5).Within(1e-6));
            Assert.That(_clock.SaveKey, Is.EqualTo("time"));
            Assert.That(_clock.LoadOrder, Is.EqualTo(10));
            manager.Dispose();
        }

        [Test]
        public void NewGame_StartsAtZero()
        {
            _clock.Tick(30f);

            _clock.Load(null, LoadContext.NewGame);

            Assert.That(_clock.PlaytimeSeconds, Is.EqualTo(0.0));
        }

        [TestCase(0.0, "0:00:00")]
        [TestCase(3725.0, "1:02:05")]
        [TestCase(85260.4, "23:41:00")]
        public void Format_ShowsHoursMinutesSeconds(double seconds, string expected)
        {
            Assert.That(PlaytimeClock.Format(seconds), Is.EqualTo(expected));
        }
    }
}
