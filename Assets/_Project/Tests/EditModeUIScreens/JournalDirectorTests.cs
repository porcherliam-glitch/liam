using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for the journal part of <see cref="UiStateDirector"/>: J in the game pushes Menu and opens the journal on the
    /// quest log, the pause menu item replaces Paused by Menu, closing pops Menu, a Menu of somebody else (inventory overlay)
    /// does not open the journal, and death, dialogues and the main menu keep it closed. Real UI manager and game state
    /// service, fake screens.
    /// </summary>
    [TestFixture]
    public sealed class JournalDirectorTests
    {
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
        private FakeMenuScreen _journal;
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
            _journal = new FakeMenuScreen(JournalScreen.Id);
            _ui.RegisterScreen(_main);
            _ui.RegisterScreen(_pause);
            _ui.RegisterScreen(_death);
            _ui.RegisterScreen(_journal);
            _director = new UiStateDirector(_ui, _state, _input, () => _pausePressed, _flow, _main, _pause, _death, 1.5f);
            _director.AttachJournal(_journal);
            _bus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _state.SwitchBase(GameState.MainMenu, "test");
            _state.SwitchBase(GameState.Loading, "test");
            _state.SwitchBase(GameState.Playing, "test");
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
        public void KeyJ_InTheGame_PushesMenu_AndOpensTheQuestLog()
        {
            PressJournal();

            Assert.That(_state.Current, Is.EqualTo(GameState.Menu));
            Assert.That(_journal.IsOpen, Is.True);
            Assert.That(_ui.Top, Is.SameAs(_journal));
            Assert.That(_journal.LastArgs, Is.EqualTo(JournalPage.Quests));
            Assert.That(_ui.IsLayerVisible(UILayer.Hud), Is.True, "the HUD stays behind the journal");
            Assert.That(_ui.Notifications.IsSuppressed, Is.True, "messages wait in menus (GDD 05 1.7)");
        }

        [Test]
        public void CloseJournal_PopsMenu_BackToTheGame()
        {
            PressJournal();

            _director.CloseJournal();

            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_journal.IsOpen, Is.False);
            Assert.That(_ui.Top, Is.Null);
        }

        [Test]
        public void PauseMenuItem_ReplacesPausedByMenu_OnTheCharacterPage()
        {
            _pausePressed = true;
            _director.Update(0.016f);
            _pausePressed = false;
            Assert.That(_pause.IsOpen, Is.True, "precondition: pause menu open");

            bool opened = _director.OpenJournal(JournalPage.Character);

            Assert.That(opened, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Menu));
            Assert.That(_state.ModalCount, Is.EqualTo(1), "stack is Playing → Menu, not Playing → Paused → Menu");
            Assert.That(_pause.IsOpen, Is.False);
            Assert.That(_journal.IsOpen, Is.True);
            Assert.That(_journal.LastArgs, Is.EqualTo(JournalPage.Character));
        }

        [Test]
        public void MenuOfSomebodyElse_DoesNotOpenTheJournal()
        {
            _state.Push(GameState.Menu, "inventory overlay");

            Assert.That(_journal.IsOpen, Is.False);
            Assert.That(_state.Current, Is.EqualTo(GameState.Menu));
        }

        [Test]
        public void KeyJ_IsIgnored_OutsideTheGame_AndWhileAFlowRuns()
        {
            _state.Push(GameState.Dialogue, "test");
            PressJournal();
            Assert.That(_journal.IsOpen, Is.False, "not in a dialogue");
            _state.Pop(GameState.Dialogue);

            _flow.IsFlowRunning = true;
            PressJournal();
            Assert.That(_journal.IsOpen, Is.False, "not while loading");
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void Death_ClosesTheJournal_AndShowsTheDeathScreen()
        {
            PressJournal();
            _director.OnPlayerDied();
            _director.Update(1.6f);

            Assert.That(_journal.IsOpen, Is.False);
            Assert.That(_death.IsOpen, Is.True);
            Assert.That(_state.Current, Is.EqualTo(GameState.Paused));
            Assert.That(_director.OpenJournal(JournalPage.Quests), Is.False, "no journal while the death screen waits");
        }

        [Test]
        public void SecondOpen_WhileOpen_IsRefused()
        {
            PressJournal();
            Assert.That(_director.OpenJournal(JournalPage.Character), Is.False);
            Assert.That(_state.ModalCount, Is.EqualTo(1));
        }

        private void PressJournal()
        {
            _input.PressedThisFrame.Add(GameplayButton.QuestLog);
            _director.Update(0.016f);
            _input.PressedThisFrame.Clear();
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            _director.Apply(evt.Current);
        }
    }
}
