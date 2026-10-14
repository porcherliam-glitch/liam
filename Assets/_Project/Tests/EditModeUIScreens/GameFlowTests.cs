using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for <see cref="GameFlow"/>: every flow takes only transitions of architecture table 4.4 and never stays in
    /// Loading; the loading screen is hidden at the end. Fakes complete synchronously (Awaitable shim).
    /// </summary>
    [TestFixture]
    public sealed class GameFlowTests
    {
        private const string Scene = "Assets/_Project/Scenes/Test/Testgelaende.unity";

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _state;
        private EventRecorder<GameStateChanged> _changes;
        private FakeSaveManager _saves;
        private FakeSceneLoader _scenes;
        private UIManager _ui;
        private LoadingScreenProxy _loading;
        private PlayerHudRegistry _players;
        private GameFlow _flow;
        private List<string> _failures;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _state = new GameStateService(_bus, new FakeTimeScaleService());
            _state.SwitchBase(GameState.MainMenu, "test");
            _changes = new EventRecorder<GameStateChanged>(_bus);
            _saves = new FakeSaveManager(_state, _bus);
            _scenes = new FakeSceneLoader();
            _ui = new UIManager(new NoInput(), () => 0d);
            _loading = new LoadingScreenProxy(_ui);
            _scenes.LoadingScreen = _loading;
            _players = new PlayerHudRegistry();
            _flow = new GameFlow(_state, _scenes, _saves, _ui, _loading, _players, Scene, "Testgelände", CancellationToken.None);
            _failures = new List<string>();
            _flow.Failed += _failures.Add;
        }

        [TearDown]
        public void TearDown()
        {
            _changes.Dispose();
            _ui.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void NewGame_MainMenuLoadingPlaying_WithTheGameplayScene()
        {
            _flow.StartNewGame();

            Assert.That(States(), Is.EqualTo(new[] { GameState.Loading, GameState.Playing }));
            Assert.That(_scenes.IsLoaded(Scene), Is.True);
            Assert.That(_saves.NewGames, Is.EqualTo(1));
            Assert.That(_loading.IsVisible, Is.False);
            Assert.That(_ui.InputBlocked, Is.False);
            Assert.That(_flow.IsBusy, Is.False);
            Assert.That(_failures, Is.Empty);
        }

        [Test]
        public void NewGame_OutsideTheMainMenu_DoesNothing()
        {
            _state.SwitchBase(GameState.Loading, "test");
            _state.SwitchBase(GameState.Playing, "test");
            _changes.Clear();

            _flow.StartNewGame();

            Assert.That(_changes.Count, Is.EqualTo(0));
            Assert.That(_saves.NewGames, Is.EqualTo(0));
        }

        [Test]
        public void NewGame_SceneMissing_ReturnsToTheMainMenuByLegalTransitions()
        {
            _scenes.Missing.Add(Scene);

            _flow.StartNewGame();

            Assert.That(_state.Current, Is.EqualTo(GameState.MainMenu));
            Assert.That(States(), Is.EqualTo(new[] { GameState.Loading, GameState.Playing, GameState.Paused, GameState.MainMenu }));
            Assert.That(_failures.Count, Is.EqualTo(1));
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void LoadFromMainMenu_LoadsTheSceneThenTheSave()
        {
            _saves.AddSlot("quick_0");

            _flow.ContinueLatest();

            Assert.That(_saves.Loaded, Is.EqualTo(new[] { "char_01/quick_0" }));
            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "world:" + Scene }));
            Assert.That(States(), Is.EqualTo(new[] { GameState.Loading, GameState.Playing }));
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void LoadFromMainMenu_Failed_BackInTheMainMenuWithoutScene_AndAMessage()
        {
            _saves.AddSlot("quick_0");
            _saves.FailLoads = true;

            _flow.LoadSlot("char_01/quick_0");

            Assert.That(_state.Current, Is.EqualTo(GameState.MainMenu));
            Assert.That(_scenes.IsLoaded(Scene), Is.False);
            Assert.That(_failures.Count, Is.EqualTo(1));
            Assert.That(_failures[0], Does.StartWith("Laden fehlgeschlagen:"));
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void ContinueWithoutSave_ReportsAFailure_AndStaysInTheMainMenu()
        {
            _flow.ContinueLatest();

            Assert.That(_failures.Count, Is.EqualTo(1));
            Assert.That(_state.Current, Is.EqualTo(GameState.MainMenu));
        }

        [Test]
        public void LoadInTheGame_FromPause_ShowsAndHidesTheLoadingScreen()
        {
            EnterPause();
            _saves.AddSlot("quick_0");
            _changes.Clear();
            _scenes.Calls.Clear();

            _flow.LoadSlot("char_01/quick_0");

            Assert.That(States(), Is.EqualTo(new[] { GameState.Loading, GameState.Playing }));
            Assert.That(_scenes.Calls, Is.Empty, "the scene stays loaded");
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void LoadInTheGame_Failed_StaysPaused_AndReports()
        {
            EnterPause();
            _saves.FailLoads = true;

            _flow.LoadSlot("char_01/quick_0");

            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_failures.Count, Is.EqualTo(1));
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void ReturnToMainMenu_FromPause_UnloadsTheScene()
        {
            EnterPause();
            _changes.Clear();

            _flow.ReturnToMainMenu();

            Assert.That(States(), Is.EqualTo(new[] { GameState.MainMenu }));
            Assert.That(_scenes.IsLoaded(Scene), Is.False);
        }

        [Test]
        public void ReturnToMainMenu_NotPaused_DoesNothing()
        {
            _flow.ReturnToMainMenu();
            Assert.That(_changes.Count, Is.EqualTo(0));
        }

        [Test]
        public void Respawn_PopsThePause_AndRespawnsThePlayer()
        {
            EnterPause();
            var player = new FakePlayer { IsDead = true };
            _players.Register(player);

            _flow.RespawnAtSpawnPoint();

            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(player.Respawns, Is.EqualTo(1));
        }

        [Test]
        public void QuickSave_ReportsTheResult()
        {
            EnterPause();
            bool success = false;

            _flow.QuickSave(result => success = result.Success);

            Assert.That(success, Is.True);
            Assert.That(_saves.Saves, Is.EqualTo(1));
        }

        [Test]
        public void PlayerRegistry_RegistersAndUnregisters()
        {
            var player = new FakePlayer();
            int changes = 0;
            _players.Changed += () => changes++;

            _players.Register(player);
            _players.Register(player);
            Assert.That(_players.Current, Is.SameAs(player));
            _players.Unregister(new FakePlayer());
            Assert.That(_players.Current, Is.SameAs(player), "only the current player unregisters");
            _players.Unregister(player);
            Assert.That(_players.Current, Is.Null);
            Assert.That(changes, Is.EqualTo(2));
        }

        private void EnterPause()
        {
            _flow.StartNewGame();
            _state.Push(GameState.Paused, "test");
        }

        private GameState[] States()
        {
            var states = new GameState[_changes.Count];
            for (int i = 0; i < states.Length; i++)
            {
                states[i] = _changes.Events[i].Current;
            }

            return states;
        }
    }
}
