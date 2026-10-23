using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for <see cref="UiStateDirector"/>: the screens follow the game state of architecture 4.4 (main menu in
    /// MainMenu, pause menu while Paused, HUD in the game), the pause button pushes Paused where the table allows it (also
    /// from a dialogue), the death screen appears after the delay as a Paused modal (also after a cutscene, over a dialogue),
    /// and flow errors reach the open screen. Real UI manager and game state service, fake screens.
    /// </summary>
    [TestFixture]
    public sealed class UiStateDirectorTests
    {
        private const float DeathDelay = 1.5f;

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _state;
        private UIManager _ui;
        private FakeGameplayInput _input;
        private bool _pausePressed;
        private FakeGameFlow _flow;
        private FakeMenuScreen _main;
        private FakeMenuScreen _pause;
        private FakeMenuScreen _death;
        private UiStateDirector _director;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _state = new GameStateService(_bus, new FakeTimeScaleService());
            _ui = new UIManager(new NoInput(), () => 0d);
            _input = new FakeGameplayInput();
            _flow = new FakeGameFlow();
            _main = new FakeMenuScreen(MainMenuScreen.Id);
            _pause = new FakeMenuScreen(PauseMenuScreen.Id);
            _death = new FakeMenuScreen(DeathScreen.Id);
            _ui.RegisterScreen(_main);
            _ui.RegisterScreen(_pause);
            _ui.RegisterScreen(_death);
            _pausePressed = false;
            _director = new UiStateDirector(_ui, _state, _input, () => _pausePressed, _flow, _main, _pause, _death, DeathDelay);
            // Like UIRoot: every state change is applied.
            _bus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _state.SwitchBase(GameState.MainMenu, "test");
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
            _ui.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void MainMenu_OpensTheMainMenu_HidesTheHud_AndBuffersMessages()
        {
            Assert.That(_main.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(_main));
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.False);
            Assert.That(_ui.Notifications.IsSuppressed, Is.True);
        }

        [Test]
        public void Playing_ClosesTheMainMenu_ShowsTheHud_AndReleasesMessages()
        {
            StartPlaying();

            Assert.That(_main.IsOpen, Is.False);
            Assert.That(_ui.Top, Is.Null);
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.True);
            Assert.That(_ui.Notifications.IsSuppressed, Is.False);
        }

        [Test]
        public void Loading_HidesTheHud_AndClosesAllScreens()
        {
            _state.SwitchBase(GameState.Loading, "test");

            Assert.That(_main.IsOpen, Is.False);
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.False);
        }

        [Test]
        public void PauseButton_InTheGame_PushesPaused_AndOpensThePauseMenu_OverTheHud()
        {
            StartPlaying();

            PressPause();

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_pause.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(_pause));
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.True, "the HUD stays visible behind the pause menu");
            Assert.That(_ui.Notifications.IsSuppressed, Is.True, "messages wait while paused (GDD 05 1.7)");
        }

        [Test]
        public void PauseButton_IsIgnored_WhileAFlowRuns()
        {
            StartPlaying();
            _flow.IsFlowRunning = true;
            _flow.IsBusy = true;
            PressPause();
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_pause.IsOpen, Is.False);
        }

        [Test]
        public void PauseButton_WorksWhileOnlyASaveIsWritten()
        {
            StartPlaying();
            // Autosave or F5 in progress: the menus wait (IsBusy), the pause button does not (IsFlowRunning).
            _flow.IsBusy = true;
            _flow.IsFlowRunning = false;

            PressPause();

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_pause.IsOpen, Is.True);
        }

        [Test]
        public void PauseButton_InADialogue_StacksPausedOverTheDialogue()
        {
            StartPlaying();
            Assert.That(_state.Push(GameState.Dialogue, "test"), Is.True);

            // The Dialog map has its own Pause action (Start / Esc); architecture 4.4: "Dialogue → Paused: Start".
            PressPause();
            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_pause.IsOpen, Is.True);

            Assert.That(_state.Pop(GameState.Paused), Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Dialogue));
            Assert.That(_pause.IsOpen, Is.False);
        }

        [TestCase(GameState.Menu)]
        [TestCase(GameState.Cutscene)]
        [TestCase(GameState.Building)]
        public void PauseButton_IsIgnored_WhereTheTableAllowsNoPaused(GameState modal)
        {
            StartPlaying();
            Assert.That(_state.Push(modal, "test"), Is.True);

            PressPause();

            Assert.That(_state.Current, Is.EqualTo(modal));
            Assert.That(_pause.IsOpen, Is.False);
        }

        [Test]
        public void PauseButton_IsIgnored_InTheMainMenuAndWhileLoading()
        {
            PressPause();
            Assert.That(_state.Current, Is.EqualTo(GameState.MainMenu));

            _state.SwitchBase(GameState.Loading, "test");
            PressPause();
            Assert.That(_state.Current, Is.EqualTo(GameState.Loading));
            Assert.That(_pause.IsOpen, Is.False);
        }

        [Test]
        public void HudPeek_IsReadFromTheGameplayMap()
        {
            StartPlaying();
            Assert.That(_director.PeekRequested, Is.False);

            _input.PressedThisFrame.Add(GameplayButton.HudPeek);
            Assert.That(_director.PeekRequested, Is.True);
            _input.IsActive = false;
            Assert.That(_director.PeekRequested, Is.False, "not while the Gameplay map is off");
        }

        [Test]
        public void Resume_PopsPaused_AndClosesThePauseMenu()
        {
            StartPlaying();
            PressPause();

            Assert.That(_state.Pop(GameState.Paused), Is.True);

            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_pause.IsOpen, Is.False);
            Assert.That(_pause.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void PlayerDied_ShowsTheDeathScreenAfterTheDelay_AsPausedModal()
        {
            StartPlaying();

            _director.OnPlayerDied();
            _director.Update(DeathDelay - 0.5f);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing), "not before the delay");
            Assert.That(_death.IsOpen, Is.False);

            _director.Update(0.6f);
            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_death.IsOpen, Is.True);
            Assert.That(_pause.IsOpen, Is.False, "the death screen replaces the pause menu");
            Assert.That(_ui.Top, Is.SameAs(_death));
        }

        [Test]
        public void RespawnedOutsideTheDeathScreen_TheDeathScreenDoesNotComeBack()
        {
            StartPlaying();
            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);
            Assert.That(_death.IsOpen, Is.True);

            // Another caller (game flow, automatic respawn) pops the pause and respawns the player: PlayerSpawned follows.
            Assert.That(_state.Pop(GameState.Paused), Is.True);
            _director.OnPlayerSpawned();
            _director.Update(0.1f);
            _director.Update(DeathDelay + 0.1f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_death.IsOpen, Is.False);
            Assert.That(_director.DeathPending, Is.False);
        }

        [Test]
        public void PlayerDied_WhileThePauseMenuIsOpen_ReplacesItByTheDeathScreen()
        {
            StartPlaying();
            PressPause();

            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_pause.IsOpen, Is.False);
            Assert.That(_death.IsOpen, Is.True);
        }

        [Test]
        public void PlayerDied_DuringACutscene_ShowsTheDeathScreenWhenTheCutsceneEnds()
        {
            StartPlaying();
            Assert.That(_state.Push(GameState.Cutscene, "test"), Is.True);

            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);
            _director.Update(0.016f);
            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene), "a cutscene allows no Paused: the death screen waits");
            Assert.That(_death.IsOpen, Is.False);
            Assert.That(_director.DeathPending, Is.True);

            Assert.That(_state.Pop(GameState.Cutscene), Is.True);
            _director.Update(0.016f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_death.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(_death));
        }

        [Test]
        public void Cutscene_OpensTheCutsceneScreen_AndThePopClosesIt()
        {
            var cutscene = new FakeMenuScreen(CutsceneScreen.Id);
            _ui.RegisterScreen(cutscene);
            _director.AttachCutscene(cutscene);
            StartPlaying();

            Assert.That(_state.Push(GameState.Cutscene, "test"), Is.True);

            Assert.That(cutscene.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(cutscene));
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.False);
            Assert.That(_main.IsOpen || _pause.IsOpen || _death.IsOpen, Is.False);

            Assert.That(_state.Pop(GameState.Cutscene), Is.True);

            Assert.That(cutscene.IsOpen, Is.False);
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.True);
        }

        [Test]
        public void Cutscene_PauseButtonStaysIgnored()
        {
            var cutscene = new FakeMenuScreen(CutsceneScreen.Id);
            _ui.RegisterScreen(cutscene);
            _director.AttachCutscene(cutscene);
            StartPlaying();
            _state.Push(GameState.Cutscene, "test");

            PressPause();

            Assert.That(_state.Current, Is.EqualTo(GameState.Cutscene));
            Assert.That(_pause.IsOpen, Is.False);
            Assert.That(cutscene.IsOpen, Is.True);
        }

        [Test]
        public void Cutscene_AttachedWhileOneRuns_OpensAtOnce()
        {
            StartPlaying();
            _state.Push(GameState.Cutscene, "test");
            var cutscene = new FakeMenuScreen(CutsceneScreen.Id);
            _ui.RegisterScreen(cutscene);

            _director.AttachCutscene(cutscene);

            Assert.That(cutscene.IsOpen, Is.True);
        }

        [Test]
        public void PlayerDied_DuringACutscene_TheDeathScreenReplacesTheCutsceneScreenAfterThePop()
        {
            var cutscene = new FakeMenuScreen(CutsceneScreen.Id);
            _ui.RegisterScreen(cutscene);
            _director.AttachCutscene(cutscene);
            StartPlaying();
            _state.Push(GameState.Cutscene, "test");

            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);
            Assert.That(cutscene.IsOpen, Is.True);
            Assert.That(_death.IsOpen, Is.False);

            _state.Pop(GameState.Cutscene);
            _director.Update(0.016f);

            Assert.That(cutscene.IsOpen, Is.False);
            Assert.That(_death.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(_death));
        }

        [Test]
        public void PlayerDied_DuringADialogue_StacksTheDeathScreenOverTheDialogue()
        {
            StartPlaying();
            Assert.That(_state.Push(GameState.Dialogue, "test"), Is.True);

            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_death.IsOpen, Is.True);
            Assert.That(_pause.IsOpen, Is.False);
        }

        [Test]
        public void PlayerDied_WhileAMenuIsOpen_ClosesTheMenuAndShowsTheDeathScreen()
        {
            StartPlaying();
            Assert.That(_state.Push(GameState.Menu, "test"), Is.True);

            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_state.Pop(GameState.Paused), Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing), "the menu was popped, not kept below the death screen");
        }

        [Test]
        public void PauseButton_IsIgnored_WhileTheDeathScreenIsPending()
        {
            StartPlaying();
            _director.OnPlayerDied();

            PressPause(0.1f);

            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_pause.IsOpen, Is.False);
        }

        [Test]
        public void Respawn_EndsTheDeath_SoTheNextPauseShowsThePauseMenu()
        {
            ShowDeathScreen();

            _director.RespawnAtSpawnPoint();
            Assert.That(_flow.Respawns, Is.EqualTo(1));
            Assert.That(_director.DeathPending, Is.False);

            // The flow pops Paused (GameFlow.RespawnAtSpawnPoint).
            _state.Pop(GameState.Paused);
            Assert.That(_death.IsOpen, Is.False);

            PressPause();
            Assert.That(_pause.IsOpen, Is.True);
            Assert.That(_death.IsOpen, Is.False);
        }

        [Test]
        public void LoadLastSave_LoadsTheNewestSlot_OrDoesNothingWithoutASave()
        {
            ShowDeathScreen();

            _director.LoadLastSave();
            Assert.That(_flow.LoadedSlots, Is.Empty);

            _flow.Latest = new SaveSlotInfo("char_01", "quick_0", null, false);
            _director.LoadLastSave();
            Assert.That(_flow.LoadedSlots, Is.EqualTo(new[] { "char_01/quick_0" }));
        }

        [Test]
        public void GameLoaded_EndsAPendingDeath()
        {
            StartPlaying();
            _director.OnPlayerDied();

            _director.OnGameLoaded();
            _director.Update(DeathDelay * 2f);

            Assert.That(_director.DeathPending, Is.False);
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_death.IsOpen, Is.False);
        }

        [Test]
        public void ShowFailure_GoesToTheOpenScreen_OtherwiseBecomesAWarningMessage()
        {
            _director.ShowFailure("Laden fehlgeschlagen: Test");
            Assert.That(_main.LastError, Is.EqualTo("Laden fehlgeschlagen: Test"));

            StartPlaying();
            _director.ShowFailure("Speichern fehlgeschlagen: Test");
            Assert.That(_ui.Notifications.PendingCount, Is.EqualTo(1));
        }

        [Test]
        public void BackToTheMainMenu_ClosesPauseAndDeath_AndClearsMessages()
        {
            ShowDeathScreen();
            _ui.ShowToast(Notification.Experience(50));

            Assert.That(_state.SwitchBase(GameState.MainMenu, "test"), Is.True);

            Assert.That(_death.IsOpen, Is.False);
            Assert.That(_pause.IsOpen, Is.False);
            Assert.That(_main.IsOpen, Is.True);
            Assert.That(_director.DeathPending, Is.False);
            Assert.That(_ui.Notifications.PendingCount, Is.EqualTo(0));
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            _director.Apply(evt.Current);
        }

        private void StartPlaying()
        {
            _state.SwitchBase(GameState.Loading, "test");
            _state.SwitchBase(GameState.Playing, "test");
        }

        private void PressPause(float deltaTime = 0.016f)
        {
            _pausePressed = true;
            _director.Update(deltaTime);
            _pausePressed = false;
        }

        private void ShowDeathScreen()
        {
            StartPlaying();
            _director.OnPlayerDied();
            _director.Update(DeathDelay + 0.1f);
            Assert.That(_death.IsOpen, Is.True, "precondition: death screen open");
        }
    }
}
