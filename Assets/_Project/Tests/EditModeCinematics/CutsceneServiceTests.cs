using System.Collections.Generic;
using Aetherfall.Cinematics;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Cinematics
{
    /// <summary>The cutscene service (S58) against the real event bus and game state service.</summary>
    [TestFixture]
    public sealed class CutsceneServiceTests
    {
        private const string Prologue = CutsceneIds.PrologueAwakening;
        private const string Other = "cs.test.zweite";

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _state;
        private CutsceneService _service;
        private EventRecorder<CutsceneStarted> _started;
        private EventRecorder<CutsceneFinished> _finished;
        private EventRecorder<GameStateChanged> _states;
        private readonly List<GameState> _stateAtFinish = new List<GameState>();

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _state = new GameStateService(_bus, new FakeTimeScaleService());
            _state.SwitchBase(GameState.MainMenu, "test");
            _state.SwitchBase(GameState.Loading, "test");
            _service = new CutsceneService(_bus, _state);
            _service.PostInitialize();
            _started = new EventRecorder<CutsceneStarted>(_bus);
            _finished = new EventRecorder<CutsceneFinished>(_bus);
            _states = new EventRecorder<GameStateChanged>(_bus);
            _stateAtFinish.Clear();
            _bus.Subscribe<CutsceneFinished>(OnFinished);
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Unsubscribe<CutsceneFinished>(OnFinished);
            _states.Dispose();
            _finished.Dispose();
            _started.Dispose();
            _service.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Request_WhileLoading_WaitsAndStartsWithTheSwitchToPlaying()
        {
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);

            Assert.That(_service.Request(Prologue, "quest.main.asche_ueber_eichental"), Is.True);
            Assert.That(_service.IsPending, Is.True);
            Assert.That(_service.IsPlaying, Is.False);
            Assert.That(_state.Current, Is.EqualTo(GameState.Loading));

            _state.SwitchBase(GameState.Playing, "test");

            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(_states.Count, Is.EqualTo(2));
            Assert.That(_states.Events[0].Current, Is.EqualTo(GameState.Playing));
            Assert.That(_states.Events[1].Previous, Is.EqualTo(GameState.Playing));
            Assert.That(_states.Events[1].Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(_started.Count, Is.EqualTo(1));
            Assert.That(_started.Last.CutsceneId, Is.EqualTo(Prologue));
            Assert.That(_started.Last.SourceId, Is.EqualTo("quest.main.asche_ueber_eichental"));
            Assert.That(player.PlayCount, Is.EqualTo(1));
            Assert.That(_service.CurrentId, Is.EqualTo(Prologue));
            Assert.That(_service.Overlay.FadeAlpha, Is.EqualTo(1f), "the first picture is black");
        }

        [Test]
        public void Request_InPlaying_StartsAtOnce()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);

            _service.Request(Prologue, "debug");

            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(player.PlayCount, Is.EqualTo(1));
            Assert.That(_service.IsPending, Is.False);
        }

        [TestCase(GameState.Menu)]
        [TestCase(GameState.Paused)]
        [TestCase(GameState.Building)]
        public void Request_WithAModalOnTop_WaitsUntilPlaying(GameState modal)
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _state.Push(modal, "test");

            _service.Request(Prologue, "debug");
            Assert.That(_service.IsPending, Is.True);
            Assert.That(player.PlayCount, Is.Zero);

            _state.Pop(modal);

            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(player.PlayCount, Is.EqualTo(1));
        }

        [Test]
        public void Request_InDialogue_ReplacesTheDialogue_AndTheEndReturnsToPlaying()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _state.Push(GameState.Dialogue, "test");

            _service.Request(Prologue, "dlg.test");

            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(_state.ModalCount, Is.EqualTo(1));
            player.Finish();
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void NaturalEnd_PopsBeforeReportingTheEnd()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");

            player.Finish();

            Assert.That(_finished.Count, Is.EqualTo(1));
            Assert.That(_finished.Last.Skipped, Is.False);
            Assert.That(_stateAtFinish, Is.EqualTo(new[] { GameState.Playing }));
            Assert.That(_service.IsPlaying, Is.False);
            Assert.That(_service.Overlay.FadeAlpha, Is.Zero);
            Assert.That(player.StopCount, Is.Zero, "a finished player is not stopped again");
        }

        [Test]
        public void Skip_StopsOnce_ReportsSkippedOnce_AndBlacksOut()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");
            int revision = _service.OverlayRevision;

            Assert.That(_service.Skip("hold"), Is.True);

            Assert.That(player.StopCount, Is.EqualTo(1));
            Assert.That(_finished.Count, Is.EqualTo(1), "the player's own Finished during Stop is ignored");
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_service.Overlay.FadeAlpha, Is.EqualTo(1f));
            Assert.That(_service.OverlayRevision, Is.GreaterThan(revision));
            Assert.That(_service.Skip("hold"), Is.False);
        }

        [Test]
        public void Skip_WhileIdle_ReturnsFalse()
        {
            ToPlaying();

            Assert.That(_service.Skip("hold"), Is.False);
            Assert.That(_service.CanSkip, Is.False);
        }

        [Test]
        public void Request_WithoutARecording_IsDroppedAfterTheGraceTime()
        {
            ToPlaying();
            _service.Request(Prologue, "debug");

            _service.Tick(1.0f);
            Assert.That(_service.IsPending, Is.True);
            Assert.That(_finished.Count, Is.Zero);

            _service.Tick(1.1f);

            Assert.That(_service.IsPending, Is.False);
            Assert.That(_finished.Count, Is.EqualTo(1));
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
        }

        [Test]
        public void Request_RecordingRegisteredWithinTheGraceTime_Plays()
        {
            ToPlaying();
            _service.Request(Prologue, "debug");
            _service.Tick(1.5f);

            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);

            Assert.That(player.PlayCount, Is.EqualTo(1));
            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
        }

        [Test]
        public void Request_WithCutscenesOff_EndsAtOnceAsSkipped()
        {
            ToPlaying();
            using (var off = new CutsceneService(_bus, _state, false))
            {
                off.PostInitialize();
                Assert.That(off.Request(Prologue, "debug"), Is.False);
            }

            Assert.That(_finished.Count, Is.EqualTo(1));
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void Queue_PlaysOneAfterTheOther_IgnoresTheSameId_AndHoldsAtMostFour()
        {
            ToPlaying();
            var first = new FakeCutscenePlayer(Prologue);
            var second = new FakeCutscenePlayer(Other);
            _service.Register(first);
            _service.Register(second);

            _service.Request(Prologue, "a");
            _service.Request(Other, "b");
            Assert.That(_service.Request(Prologue, "again"), Is.True, "already playing: accepted, not queued");
            Assert.That(_service.CurrentId, Is.EqualTo(Prologue));

            first.Finish();

            Assert.That(_service.CurrentId, Is.EqualTo(Other));
            Assert.That(second.PlayCount, Is.EqualTo(1));
            second.Finish();
            Assert.That(first.PlayCount, Is.EqualTo(1), "the request while it played was not queued again");
            Assert.That(_started.Count, Is.EqualTo(2));
            Assert.That(_service.IsPlaying, Is.False);
            Assert.That(_service.IsPending, Is.False);

            Assert.That(_state.Push(GameState.Menu, "test"), Is.True);
            Assert.That(_service.Request("cs.test.0", "test"), Is.True);
            Assert.That(_service.Request("cs.test.0", "again"), Is.True, "already waiting: accepted, takes no second place");
            for (int i = 1; i < CutsceneService.MaxQueue; i++)
            {
                Assert.That(_service.Request("cs.test." + i, "test"), Is.True);
            }

            Assert.That(_service.Request("cs.test.voll", "test"), Is.False);
        }

        [Test]
        public void SwitchToLoading_ForgetsWaitingRequests()
        {
            ToPlaying();
            _state.Push(GameState.Menu, "test");
            _service.Request(Prologue, "debug");
            _state.Pop(GameState.Menu);
            Assert.That(_service.IsPending, Is.True, "no recording yet");

            _state.SwitchBase(GameState.Loading, "test");

            Assert.That(_service.IsPending, Is.False);
        }

        [Test]
        public void EndSession_EndsTheCutsceneAndForgetsTheQueue()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");
            _service.Request(Other, "debug");

            _service.EndSession();

            Assert.That(_service.IsPlaying, Is.False);
            Assert.That(_service.IsPending, Is.False);
            Assert.That(player.StopCount, Is.EqualTo(1));
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void Unregister_ThePlayingPlayer_EndsAsSkipped()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");

            _service.Unregister(player);

            Assert.That(_service.IsPlaying, Is.False);
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_service.PlayerCount, Is.Zero);
        }

        [Test]
        public void Combat_KeepsARequestWaitingUntilItEnds()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _bus.Publish(new CombatStateChanged(true));

            _service.Request(Prologue, "debug");
            Assert.That(_service.IsPending, Is.True);

            _bus.Publish(new CombatStateChanged(false));

            Assert.That(player.PlayCount, Is.EqualTo(1));
            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
        }

        [Test]
        public void FightOfTheOldSession_DoesNotHoldBackTheNextNewGame()
        {
            ToPlaying();
            _bus.Publish(new CombatStateChanged(true));
            _state.Push(GameState.Paused, "test");
            _state.SwitchBase(GameState.MainMenu, "test");
            _state.SwitchBase(GameState.Loading, "test");
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "quest");

            _state.SwitchBase(GameState.Playing, "test");

            Assert.That(player.PlayCount, Is.EqualTo(1));
            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
        }

        [Test]
        public void PlayerDied_EndsTheCutsceneAsSkipped_SoTheDeathScreenCanPause()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");

            _bus.Publish(new PlayerDied(default, string.Empty, string.Empty));

            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_state.Push(GameState.Paused, "death screen"), Is.True);
        }

        [Test]
        public void AnotherSystemPoppingTheCutscene_StopsThePlayerAndCountsAsSkipped()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");

            _state.Pop(GameState.Cutscene);

            Assert.That(player.StopCount, Is.EqualTo(1));
            Assert.That(_finished.Count, Is.EqualTo(1));
            Assert.That(_finished.Last.Skipped, Is.True);
            Assert.That(_service.IsPlaying, Is.False);
        }

        [Test]
        public void SetOverlay_CountsOnlyChanges_AndOnlyWhilePlaying()
        {
            ToPlaying();
            var player = new FakeCutscenePlayer(Prologue);
            _service.Register(player);
            _service.Request(Prologue, "debug");
            int revision = _service.OverlayRevision;
            var line = new CutsceneOverlay("Lina", "Halt mich fest!", string.Empty, 0f, CutsceneFadeColor.Black);

            player.Host.SetOverlay(line);
            player.Host.SetOverlay(line);
            Assert.That(_service.OverlayRevision, Is.EqualTo(revision + 1));
            Assert.That(_service.Overlay.Speaker, Is.EqualTo("Lina"));

            player.Finish();
            int afterEnd = _service.OverlayRevision;
            player.Host.SetOverlay(CutsceneOverlay.Black);
            Assert.That(_service.OverlayRevision, Is.EqualTo(afterEnd));
        }

        private void ToPlaying()
        {
            _state.SwitchBase(GameState.Playing, "test");
            _states.Clear();
        }

        private void OnFinished(CutsceneFinished evt)
        {
            _stateAtFinish.Add(_state.Current);
        }
    }
}
