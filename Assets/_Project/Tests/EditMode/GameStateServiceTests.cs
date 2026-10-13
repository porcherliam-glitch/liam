using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Unit tests for <see cref="GameStateService"/> (architecture 4.4): allowed and forbidden transitions, modal stack,
    /// time scale per state and <see cref="GameStateChanged"/> events. Uses a real <see cref="EventBus"/> and a
    /// <see cref="FakeTimeScaleService"/>; no Unity calls.
    /// </summary>
    [TestFixture]
    public sealed class GameStateServiceTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private FakeTimeScaleService _timeScale;
        private GameStateService _service;
        private EventRecorder<GameStateChanged> _events;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _timeScale = new FakeTimeScaleService();
            _service = new GameStateService(_bus, _timeScale);
            _events = new EventRecorder<GameStateChanged>(_bus);
        }

        [TearDown]
        public void TearDown()
        {
            _events.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        // ---- construction ------------------------------------------------------------------------------------------

        [Test]
        public void Constructor_StartsInBootWithTimeScaleOne()
        {
            Assert.That(_service.Current, Is.EqualTo(GameState.Boot));
            Assert.That(_service.BaseState, Is.EqualTo(GameState.Boot));
            Assert.That(_service.ModalCount, Is.EqualTo(0));
            Assert.That(_timeScale.History, Is.EqualTo(new[] { 1f }));
        }

        [Test]
        public void Constructor_NullArguments_Throw()
        {
            Assert.Throws<ArgumentNullException>(() => new GameStateService(null, _timeScale));
            Assert.Throws<ArgumentNullException>(() => new GameStateService(_bus, null));
        }

        // ---- allowed transitions -----------------------------------------------------------------------------------

        private static IEnumerable<TestCaseData> AllowedBaseSwitches()
        {
            yield return new TestCaseData(GameState.Boot, GameState.MainMenu);
            yield return new TestCaseData(GameState.MainMenu, GameState.Loading);
            yield return new TestCaseData(GameState.Loading, GameState.Playing);
            yield return new TestCaseData(GameState.Playing, GameState.Loading);
            yield return new TestCaseData(GameState.Paused, GameState.Loading);
            yield return new TestCaseData(GameState.Paused, GameState.MainMenu);
        }

        [TestCaseSource(nameof(AllowedBaseSwitches))]
        public void SwitchBase_AllowedTransition_ChangesStateAndPublishesOneEvent(GameState from, GameState to)
        {
            Reach(from);
            _events.Clear();

            bool result = _service.SwitchBase(to, "test");

            Assert.That(result, Is.True, _log.Sink.Dump());
            Assert.That(_service.Current, Is.EqualTo(to));
            Assert.That(_service.BaseState, Is.EqualTo(to));
            Assert.That(_service.ModalCount, Is.EqualTo(0));
            Assert.That(_events.Count, Is.EqualTo(1));
            Assert.That(_events.Last.Previous, Is.EqualTo(from));
            Assert.That(_events.Last.Current, Is.EqualTo(to));
            Assert.That(_timeScale.TimeScale, Is.EqualTo(1f));
        }

        private static IEnumerable<TestCaseData> AllowedPushes()
        {
            yield return new TestCaseData(GameState.Playing, GameState.Menu);
            yield return new TestCaseData(GameState.Playing, GameState.Paused);
            yield return new TestCaseData(GameState.Playing, GameState.Dialogue);
            yield return new TestCaseData(GameState.Playing, GameState.Cutscene);
            yield return new TestCaseData(GameState.Playing, GameState.Building);
            yield return new TestCaseData(GameState.Dialogue, GameState.Paused);
        }

        [TestCaseSource(nameof(AllowedPushes))]
        public void Push_AllowedTransition_StacksModalAndPublishesOneEvent(GameState from, GameState modal)
        {
            Reach(from);
            int modalCountBefore = _service.ModalCount;
            _events.Clear();

            bool result = _service.Push(modal, "test");

            Assert.That(result, Is.True, _log.Sink.Dump());
            Assert.That(_service.Current, Is.EqualTo(modal));
            Assert.That(_service.BaseState, Is.EqualTo(GameState.Playing));
            Assert.That(_service.ModalCount, Is.EqualTo(modalCountBefore + 1));
            Assert.That(_service.GetModalAt(_service.ModalCount - 1), Is.EqualTo(modal));
            Assert.That(_events.Count, Is.EqualTo(1));
            Assert.That(_events.Last.Previous, Is.EqualTo(from));
            Assert.That(_events.Last.Current, Is.EqualTo(modal));
        }

        private static IEnumerable<TestCaseData> AllowedPops()
        {
            yield return new TestCaseData(new[] { GameState.Menu }, GameState.Playing);
            yield return new TestCaseData(new[] { GameState.Paused }, GameState.Playing);
            yield return new TestCaseData(new[] { GameState.Dialogue }, GameState.Playing);
            yield return new TestCaseData(new[] { GameState.Cutscene }, GameState.Playing);
            yield return new TestCaseData(new[] { GameState.Building }, GameState.Playing);
            yield return new TestCaseData(new[] { GameState.Dialogue, GameState.Paused }, GameState.Dialogue);
        }

        [TestCaseSource(nameof(AllowedPops))]
        public void Pop_MatchingTop_RevealsStateBelowAndPublishesOneEvent(GameState[] modals, GameState expectedAfterPop)
        {
            Reach(GameState.Playing);
            foreach (GameState modal in modals)
            {
                Assert.That(_service.Push(modal, "test"), Is.True);
            }

            GameState top = modals[modals.Length - 1];
            _events.Clear();

            bool result = _service.Pop(top);

            Assert.That(result, Is.True, _log.Sink.Dump());
            Assert.That(_service.Current, Is.EqualTo(expectedAfterPop));
            Assert.That(_service.ModalCount, Is.EqualTo(modals.Length - 1));
            Assert.That(_events.Count, Is.EqualTo(1));
            Assert.That(_events.Last.Previous, Is.EqualTo(top));
            Assert.That(_events.Last.Current, Is.EqualTo(expectedAfterPop));
        }

        [Test]
        public void Push_CutsceneFromDialogue_ReplacesDialogueAndReturnsToPlaying()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Dialogue, "talk");

            Assert.That(_service.Push(GameState.Cutscene, "dialogue action"), Is.True);
            Assert.That(_service.ModalCount, Is.EqualTo(1));
            Assert.That(_service.GetModalAt(0), Is.EqualTo(GameState.Cutscene));
            Assert.That(_events.Last.Previous, Is.EqualTo(GameState.Dialogue));
            Assert.That(_events.Last.Current, Is.EqualTo(GameState.Cutscene));

            Assert.That(_service.Pop(GameState.Dialogue), Is.False, "The dialogue was replaced and cannot be popped anymore.");
            Assert.That(_service.Pop(GameState.Cutscene), Is.True);
            Assert.That(_service.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_service.ModalCount, Is.EqualTo(0));
        }

        [Test]
        public void SwitchBase_FromPausedOverDialogue_ClearsWholeStackWithOneEvent()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Dialogue, "talk");
            _service.Push(GameState.Paused, "start button");
            _events.Clear();

            Assert.That(_service.SwitchBase(GameState.Loading, "load save"), Is.True);

            Assert.That(_service.Current, Is.EqualTo(GameState.Loading));
            Assert.That(_service.ModalCount, Is.EqualTo(0));
            Assert.That(_events.Count, Is.EqualTo(1));
            Assert.That(_events.Last.Previous, Is.EqualTo(GameState.Paused));
            Assert.That(_events.Last.Current, Is.EqualTo(GameState.Loading));
            Assert.That(_timeScale.TimeScale, Is.EqualTo(1f));
        }

        // ---- forbidden transitions ---------------------------------------------------------------------------------

        [TestCase(GameState.Boot, GameState.Boot)]
        [TestCase(GameState.Boot, GameState.Loading)]
        [TestCase(GameState.Boot, GameState.Playing)]
        [TestCase(GameState.MainMenu, GameState.Playing)]
        [TestCase(GameState.MainMenu, GameState.Boot)]
        [TestCase(GameState.Loading, GameState.MainMenu)]
        [TestCase(GameState.Playing, GameState.MainMenu)]
        [TestCase(GameState.Playing, GameState.Playing)]
        [TestCase(GameState.Menu, GameState.Loading)]
        [TestCase(GameState.Dialogue, GameState.MainMenu)]
        [TestCase(GameState.Cutscene, GameState.Loading)]
        [TestCase(GameState.Building, GameState.MainMenu)]
        [TestCase(GameState.Paused, GameState.Playing)]
        public void SwitchBase_ForbiddenTransition_IsRejectedWithoutSideEffects(GameState from, GameState to)
        {
            Reach(from);
            AssertRejected(() => _service.SwitchBase(to, "test"));
        }

        [TestCase(GameState.Playing, GameState.Paused)]
        [TestCase(GameState.Playing, GameState.Menu)]
        public void SwitchBase_ToModalState_IsRejected(GameState from, GameState modal)
        {
            Reach(from);
            AssertRejected(() => _service.SwitchBase(modal, "test"));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "not a base state"), Is.True);
        }

        [TestCase(GameState.Boot, GameState.Menu)]
        [TestCase(GameState.MainMenu, GameState.Paused)]
        [TestCase(GameState.Loading, GameState.Dialogue)]
        [TestCase(GameState.Menu, GameState.Menu)]
        [TestCase(GameState.Menu, GameState.Paused)]
        [TestCase(GameState.Paused, GameState.Menu)]
        [TestCase(GameState.Paused, GameState.Paused)]
        [TestCase(GameState.Dialogue, GameState.Dialogue)]
        [TestCase(GameState.Dialogue, GameState.Menu)]
        [TestCase(GameState.Dialogue, GameState.Building)]
        [TestCase(GameState.Cutscene, GameState.Paused)]
        [TestCase(GameState.Cutscene, GameState.Dialogue)]
        [TestCase(GameState.Building, GameState.Dialogue)]
        public void Push_ForbiddenTransition_IsRejectedWithoutSideEffects(GameState from, GameState modal)
        {
            Reach(from);
            AssertRejected(() => _service.Push(modal, "test"));
        }

        [Test]
        public void Push_BaseState_IsRejected()
        {
            Reach(GameState.Playing);
            AssertRejected(() => _service.Push(GameState.Playing, "test"));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "not a modal state"), Is.True);
        }

        [Test]
        public void Pop_WithWrongExpectedTop_IsRejected()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Menu, "inventory");

            AssertRejected(() => _service.Pop(GameState.Paused));

            Assert.That(_service.Current, Is.EqualTo(GameState.Menu));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "top modal state is Menu"), Is.True, _log.Sink.Dump());
        }

        [Test]
        public void Pop_LowerModalWhilePausedOnTop_IsRejected()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Dialogue, "talk");
            _service.Push(GameState.Paused, "start button");

            AssertRejected(() => _service.Pop(GameState.Dialogue));

            Assert.That(_service.Pop(GameState.Paused), Is.True);
            Assert.That(_service.Pop(GameState.Dialogue), Is.True);
            Assert.That(_service.Current, Is.EqualTo(GameState.Playing));
        }

        [TestCase(GameState.Playing)]
        [TestCase(GameState.MainMenu)]
        public void Pop_WithEmptyStack_IsRejected(GameState baseState)
        {
            Reach(baseState);
            AssertRejected(() => _service.Pop(GameState.Menu));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "modal stack is empty"), Is.True);
        }

        // ---- time scale ------------------------------------------------------------------------------------------------

        [TestCase(GameState.MainMenu, 1f)]
        [TestCase(GameState.Loading, 1f)]
        [TestCase(GameState.Playing, 1f)]
        [TestCase(GameState.Menu, 0f)]
        [TestCase(GameState.Paused, 0f)]
        [TestCase(GameState.Dialogue, 1f)]
        [TestCase(GameState.Cutscene, 1f)]
        [TestCase(GameState.Building, 1f)]
        public void TimeScale_FollowsTableOfArchitecture44(GameState state, float expected)
        {
            Reach(state);

            Assert.That(_service.Current, Is.EqualTo(state));
            Assert.That(_timeScale.TimeScale, Is.EqualTo(expected));
            Assert.That(GameStateService.GetTimeScale(state), Is.EqualTo(expected));
        }

        [Test]
        public void TimeScale_IsRestoredWhenPausedIsPopped()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Dialogue, "talk");
            Assert.That(_timeScale.TimeScale, Is.EqualTo(1f));

            _service.Push(GameState.Paused, "start button");
            Assert.That(_timeScale.TimeScale, Is.EqualTo(0f));

            _service.Pop(GameState.Paused);
            Assert.That(_timeScale.TimeScale, Is.EqualTo(1f), "Back in Dialogue the game time runs again.");
        }

        [Test]
        public void TimeScale_IsNotTouchedByRejectedTransitions()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Menu, "inventory");
            int calls = _timeScale.History.Count;

            _service.Push(GameState.Paused, "start button");
            _service.SwitchBase(GameState.MainMenu, "test");

            Assert.That(_timeScale.History.Count, Is.EqualTo(calls));
            Assert.That(_timeScale.TimeScale, Is.EqualTo(0f));
        }

        // ---- events --------------------------------------------------------------------------------------------------

        [Test]
        public void Events_FollowTheSequenceOfChanges()
        {
            _service.SwitchBase(GameState.MainMenu, "boot");
            _service.SwitchBase(GameState.Loading, "new game");
            _service.SwitchBase(GameState.Playing, "loaded");
            _service.Push(GameState.Dialogue, "talk");
            _service.Push(GameState.Paused, "start button");
            _service.Pop(GameState.Paused);
            _service.Pop(GameState.Dialogue);

            var expected = new[]
            {
                new GameStateChanged(GameState.Boot, GameState.MainMenu),
                new GameStateChanged(GameState.MainMenu, GameState.Loading),
                new GameStateChanged(GameState.Loading, GameState.Playing),
                new GameStateChanged(GameState.Playing, GameState.Dialogue),
                new GameStateChanged(GameState.Dialogue, GameState.Paused),
                new GameStateChanged(GameState.Paused, GameState.Dialogue),
                new GameStateChanged(GameState.Dialogue, GameState.Playing)
            };

            Assert.That(_events.Count, Is.EqualTo(expected.Length));
            for (int i = 0; i < expected.Length; i++)
            {
                Assert.That(_events.Events[i].Previous, Is.EqualTo(expected[i].Previous), "event " + i);
                Assert.That(_events.Events[i].Current, Is.EqualTo(expected[i].Current), "event " + i);
            }
        }

        [Test]
        public void Events_SeeTheNewStateAndTimeScaleWhenDelivered()
        {
            Reach(GameState.Playing);
            _bus.Subscribe<GameStateChanged>(AssertServiceIsConsistent);

            _service.Push(GameState.Paused, "start button");

            _bus.Unsubscribe<GameStateChanged>(AssertServiceIsConsistent);
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(0), _log.Sink.Dump());
        }

        [Test]
        public void GetModalAt_OutOfRange_Throws()
        {
            Reach(GameState.Playing);
            _service.Push(GameState.Menu, "inventory");

            Assert.That(_service.GetModalAt(0), Is.EqualTo(GameState.Menu));
            Assert.Throws<ArgumentOutOfRangeException>(() => _service.GetModalAt(1));
            Assert.Throws<ArgumentOutOfRangeException>(() => _service.GetModalAt(-1));
        }

        [Test]
        public void SuccessfulChange_IsLoggedAsInfoInCategoryGameState()
        {
            _service.SwitchBase(GameState.MainMenu, "Boot completed");

            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(1));
            CapturedLogEntry entry = _log.Sink.Entries[0];
            Assert.That(entry.Level, Is.EqualTo(LogLevel.Info));
            Assert.That(entry.Category, Is.EqualTo(LogCategory.GameState));
            Assert.That(entry.Message, Does.Contain("Boot -> MainMenu"));
            Assert.That(entry.Message, Does.Contain("Boot completed"));
        }

        // ---- helpers -------------------------------------------------------------------------------------------------

        private void AssertServiceIsConsistent(GameStateChanged evt)
        {
            // Exceptions thrown here are caught by the bus and logged as errors, which the test checks.
            if (_service.Current != evt.Current || _timeScale.TimeScale != GameStateService.GetTimeScale(evt.Current))
            {
                throw new InvalidOperationException("State or time scale not updated before the event was published.");
            }
        }

        private void AssertRejected(Func<bool> request)
        {
            GameState current = _service.Current;
            GameState baseState = _service.BaseState;
            int modalCount = _service.ModalCount;
            float timeScale = _timeScale.TimeScale;
            int eventCount = _events.Count;
            int warnings = _log.Sink.Count(LogLevel.Warning);

            bool result = request();

            Assert.That(result, Is.False, "The request must be rejected.");
            Assert.That(_service.Current, Is.EqualTo(current));
            Assert.That(_service.BaseState, Is.EqualTo(baseState));
            Assert.That(_service.ModalCount, Is.EqualTo(modalCount));
            Assert.That(_timeScale.TimeScale, Is.EqualTo(timeScale));
            Assert.That(_events.Count, Is.EqualTo(eventCount), "Rejected requests must not publish events.");
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(warnings + 1), "Rejected requests are logged as one warning.");
        }

        /// <summary>Drives the service from Boot along allowed transitions until <paramref name="target"/> is current.</summary>
        private void Reach(GameState target)
        {
            if (target == GameState.Boot)
            {
                return;
            }

            Assert.That(_service.SwitchBase(GameState.MainMenu, "setup"), Is.True);
            if (target == GameState.MainMenu)
            {
                return;
            }

            Assert.That(_service.SwitchBase(GameState.Loading, "setup"), Is.True);
            if (target == GameState.Loading)
            {
                return;
            }

            Assert.That(_service.SwitchBase(GameState.Playing, "setup"), Is.True);
            if (target == GameState.Playing)
            {
                return;
            }

            Assert.That(_service.Push(target, "setup"), Is.True, "Cannot reach " + target);
        }
    }
}
