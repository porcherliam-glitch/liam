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
    /// <see cref="GameFlow"/> with several world spaces (guide 12, 11.5): loading opens the scene the save was made in, a load
    /// in the game changes the scene if needed, and the main menu unloads the scene that is open, not the default one.
    /// </summary>
    [TestFixture]
    public sealed class GameFlowWorldSpaceTests
    {
        private const string Village = "Assets/_Project/Scenes/World/Eichental.unity";
        private const string Crypt = "Assets/_Project/Scenes/Dungeons/Gruft.unity";
        private const string VillageId = "worldspace.eichental.mini_slice";
        private const string CryptId = "worldspace.eichental.gruft";

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _state;
        private EventRecorder<GameStateChanged> _changes;
        private FakeSaveManager _saves;
        private FakeSceneLoader _scenes;
        private UIManager _ui;
        private LoadingScreenProxy _loading;
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
            var directory = new WorldSpaceDirectory();
            directory.Add(VillageId, Village, "Eichental");
            directory.Add(CryptId, Crypt, "Die vergessene Gruft");
            _flow = new GameFlow(_state, _scenes, _saves, _ui, _loading, new PlayerHudRegistry(), Village, "Eichental", CancellationToken.None,
                ImmediateFrames.Wait, directory);
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
        public void Directory_ResolvesKnownIds_AndIgnoresIncompleteEntries()
        {
            var directory = new WorldSpaceDirectory();
            directory.Add(CryptId, Crypt, "Gruft");
            directory.Add(string.Empty, Village, "x");
            directory.Add("worldspace.leer", string.Empty, "x");

            Assert.That(directory.Count, Is.EqualTo(1));
            Assert.That(directory.TryResolve(CryptId, out string scene, out string title), Is.True);
            Assert.That(scene, Is.EqualTo(Crypt));
            Assert.That(title, Is.EqualTo("Gruft"));
            Assert.That(directory.TryResolve("worldspace.unbekannt", out scene, out title), Is.False);
            Assert.That(scene, Is.Empty);
            Assert.That(directory.TryResolve(null, out _, out _), Is.False);
            Assert.That(directory.TitleOfScene(Crypt), Is.EqualTo("Gruft"));
        }

        [Test]
        public void Continue_ASaveFromTheCrypt_OpensTheCrypt()
        {
            _saves.AddSlot("auto_0", CryptId);

            _flow.ContinueLatest();

            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "world:" + Crypt }));
            Assert.That(_saves.Loaded, Is.EqualTo(new[] { "char_01/auto_0" }));
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_failures, Is.Empty);
        }

        [Test]
        public void Continue_ASaveWithoutOrWithAnUnknownWorldSpace_OpensTheGameplayScene()
        {
            _saves.AddSlot("manual_0");
            _flow.ContinueLatest();
            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "world:" + Village }));

            _saves.AddSlot("manual_1", "worldspace.unbekannt");
            _state.Push(GameState.Paused, "test");
            _flow.ReturnToMainMenu();
            _scenes.Calls.Clear();
            _flow.ContinueLatest();
            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "world:" + Village }));
        }

        [Test]
        public void LoadInTheGame_FromTheVillage_ASaveInTheCrypt_ChangesTheSceneFirst()
        {
            _saves.AddSlot("manual_0", VillageId);
            _flow.ContinueLatest();
            _saves.AddSlot("quick_0", CryptId);
            _state.Push(GameState.Paused, "test");
            _scenes.Calls.Clear();
            _changes.Clear();

            _flow.LoadSlot("char_01/quick_0");

            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "world:" + Crypt }));
            Assert.That(_saves.Loaded[_saves.Loaded.Count - 1], Is.EqualTo("char_01/quick_0"));
            Assert.That(_state.Current, Is.EqualTo(GameState.Playing));
            Assert.That(_scenes.CurrentWorldSpace, Is.EqualTo(Crypt));
            Assert.That(_loading.IsVisible, Is.False);
            Assert.That(_failures, Is.Empty);
        }

        [Test]
        public void LoadInTheGame_InTheSameWorldSpace_LoadsInPlace()
        {
            _saves.AddSlot("manual_0", VillageId);
            _flow.ContinueLatest();
            _state.Push(GameState.Paused, "test");
            _scenes.Calls.Clear();

            _flow.LoadSlot("char_01/manual_0");

            Assert.That(_scenes.Calls, Is.Empty, "no scene change");
            Assert.That(_saves.Loaded.Count, Is.EqualTo(2));
            Assert.That(_loading.IsVisible, Is.False);
        }

        [Test]
        public void ReturnToMainMenu_InTheCrypt_UnloadsTheCrypt()
        {
            _saves.AddSlot("auto_0", CryptId);
            _flow.ContinueLatest();
            _state.Push(GameState.Paused, "test");
            _scenes.Calls.Clear();

            _flow.ReturnToMainMenu();

            Assert.That(_scenes.Calls, Is.EqualTo(new[] { "unload:" + Crypt }));
            Assert.That(_scenes.IsLoaded(Crypt), Is.False);
            Assert.That(_state.Current, Is.EqualTo(GameState.MainMenu));
        }

        [Test]
        public void TheFlowIsTheGameLoader()
        {
            IGameLoader loader = _flow;
            _saves.AddSlot("quick_0", CryptId);

            loader.LoadSlot("char_01/quick_0");

            Assert.That(_scenes.CurrentWorldSpace, Is.EqualTo(Crypt));
        }
    }
}
