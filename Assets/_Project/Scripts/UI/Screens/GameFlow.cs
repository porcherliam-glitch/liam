using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Default <see cref="IGameFlow"/>. Every state change follows the transition table of architecture 4.4:
    /// <list type="bullet">
    /// <item>New game / load from the main menu: <c>SwitchBase(Loading)</c>, loading screen, world space change to the gameplay
    /// scene (<see cref="ISceneLoader.ChangeWorldSpaceAsync"/>), one frame for the scene objects, then
    /// <see cref="ISaveManager.NewGameAsync"/> / <see cref="ISaveManager.LoadAsync"/>, which switch Loading → Playing.</item>
    /// <item>Load in the game (pause menu, death screen, F9 through <see cref="IGameLoader"/>): the save manager switches Paused → Loading
    /// → Playing in place. A save from another world space (its header names it, <see cref="WorldSpaceDirectory"/>) changes the
    /// scene first, like a load from the main menu.</item>
    /// <item>Main menu: <c>SwitchBase(MainMenu)</c> from Paused, then the gameplay scene is unloaded.</item>
    /// <item>Respawn: <c>Pop(Paused)</c> of the death screen, then the player respawns.</item>
    /// </list>
    /// </summary>
    /// <remarks>
    /// <para>If a load from the main menu fails after the switch to Loading (damaged save, scene missing), the table offers no
    /// direct way back (Loading → Playing only). The flow then takes the legal path Loading → Playing → Paused → MainMenu and
    /// unloads the scene again; the main menu shows the reason.</para>
    /// <para>Fire-and-forget methods (menu buttons) run their awaitable work in <c>async void</c> adapters with try/catch;
    /// cancellation comes from <see cref="Application.exitCancellationToken"/>.</para>
    /// </remarks>
    public sealed class GameFlow : IGameFlow, IGameLoader
    {
        private const string Reason = "Game flow";

        private readonly IGameStateService _gameState;
        private readonly ISceneLoader _scenes;
        private readonly ISaveManager _saves;
        private readonly IUIManager _ui;
        private readonly ILoadingScreen _loadingScreen;
        private readonly IPlayerHudRegistry _players;
        private readonly string _gameplaySceneKey;
        private readonly string _gameplaySceneTitle;
        private readonly CancellationToken _cancellation;
        private readonly FrameWait _nextFrame;
        private readonly WorldSpaceDirectory _worldSpaces;
        private bool _busy;

        /// <summary>Creates the flow.</summary>
        /// <param name="gameState">Game state service.</param>
        /// <param name="scenes">Scene loader.</param>
        /// <param name="saves">Save manager.</param>
        /// <param name="ui">UI manager (messages).</param>
        /// <param name="loadingScreen">Loading screen.</param>
        /// <param name="players">Registered player (respawn).</param>
        /// <param name="gameplaySceneKey">Scene key of the gameplay scene (for now the test ground).</param>
        /// <param name="gameplaySceneTitle">Title on the loading screen.</param>
        /// <param name="cancellation">Ends running flows (application quits).</param>
        /// <param name="nextFrame">Waits one frame; null = <see cref="FrameWaits.NextFrame"/>.</param>
        /// <param name="worldSpaces">
        /// Scenes of the world spaces (loading opens the scene of the save, guide 12, 11.5); null = always the gameplay scene.
        /// </param>
        public GameFlow(IGameStateService gameState, ISceneLoader scenes, ISaveManager saves, IUIManager ui, ILoadingScreen loadingScreen,
            IPlayerHudRegistry players, string gameplaySceneKey, string gameplaySceneTitle, CancellationToken cancellation, FrameWait nextFrame = null,
            WorldSpaceDirectory worldSpaces = null)
        {
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            _scenes = scenes ?? throw new ArgumentNullException(nameof(scenes));
            _saves = saves ?? throw new ArgumentNullException(nameof(saves));
            _ui = ui ?? throw new ArgumentNullException(nameof(ui));
            _loadingScreen = loadingScreen ?? throw new ArgumentNullException(nameof(loadingScreen));
            _players = players ?? throw new ArgumentNullException(nameof(players));
            _gameplaySceneKey = gameplaySceneKey ?? string.Empty;
            _gameplaySceneTitle = gameplaySceneTitle ?? string.Empty;
            _cancellation = cancellation;
            _nextFrame = nextFrame ?? FrameWaits.NextFrame;
            _worldSpaces = worldSpaces ?? new WorldSpaceDirectory();
        }

        /// <inheritdoc />
        public bool IsBusy => IsFlowRunning || _saves.IsBusy;

        /// <inheritdoc />
        public bool IsFlowRunning => _busy || _scenes.IsBusy;

        /// <inheritdoc />
        public event Action<string> Failed;

        /// <inheritdoc />
        public bool TryGetLatestSave(out SaveSlotInfo slot)
        {
            return _saves.TryGetLatestSlot(null, out slot);
        }

        /// <inheritdoc />
        public IReadOnlyList<SaveSlotInfo> ListSaves()
        {
            return _saves.ListSlots(null);
        }

        /// <inheritdoc />
        public void StartNewGame()
        {
            if (!CanStart("StartNewGame", GameState.MainMenu))
            {
                return;
            }

            Run(StartNewGameAsync, "New game");
        }

        /// <inheritdoc />
        public void ContinueLatest()
        {
            if (!TryGetLatestSave(out SaveSlotInfo slot))
            {
                RaiseFailed(UiTexts.Format(UiTextKeys.LoadFailed, UiTexts.Get(UiTextKeys.NoSave)));
                return;
            }

            LoadSlot(slot.SlotId);
        }

        /// <inheritdoc />
        public void LoadSlot(string slotId)
        {
            if (string.IsNullOrEmpty(slotId) || IsBusy)
            {
                Log.Warning(LogCategory.UI, "LoadSlot('" + slotId + "') ignored: " + (IsBusy ? "a flow is running." : "no slot id."));
                return;
            }

            GameState current = _gameState.Current;
            if (current == GameState.MainMenu)
            {
                Run(ct => LoadFromMainMenuAsync(slotId, ct), "Load from the main menu");
            }
            else if (current == GameState.Paused || current == GameState.Playing)
            {
                Run(ct => LoadInGameAsync(slotId, ct), "Load in the game");
            }
            else
            {
                Log.Warning(LogCategory.UI, "LoadSlot('" + slotId + "') ignored in game state " + current + ".");
            }
        }

        /// <inheritdoc />
        public void QuickSave(Action<SaveResult> completed)
        {
            Run(async ct =>
            {
                SaveResult result = await _saves.QuickSaveAsync(ct);
                if (completed != null)
                {
                    completed(result);
                }
            }, "Quick save");
        }

        /// <inheritdoc />
        public void ReturnToMainMenu()
        {
            if (!CanStart("ReturnToMainMenu", GameState.Paused))
            {
                return;
            }

            Run(ReturnToMainMenuAsync, "Back to the main menu");
        }

        /// <inheritdoc />
        public void RespawnAtSpawnPoint()
        {
            if (_gameState.Current == GameState.Paused && !_gameState.Pop(GameState.Paused))
            {
                return;
            }

            IPlayerHudSource player = _players.Current;
            if (player == null)
            {
                Log.Warning(LogCategory.UI, "RespawnAtSpawnPoint: no player is registered (PlayerHudLink missing on the player?).");
                return;
            }

            player.Respawn();
        }

        /// <inheritdoc />
        public void QuitGame()
        {
            Log.Info(LogCategory.UI, "Quit requested from the menu.");
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        private bool CanStart(string operation, GameState requiredState)
        {
            if (IsBusy)
            {
                Log.Warning(LogCategory.UI, operation + " ignored: another flow, scene load or save is running.");
                return false;
            }

            if (_gameState.Current != requiredState)
            {
                Log.Warning(LogCategory.UI, operation + " ignored in game state " + _gameState.Current + " (expected " + requiredState + ").");
                return false;
            }

            return true;
        }

        private async Awaitable StartNewGameAsync(CancellationToken ct)
        {
            _ui.Notifications.Clear();
            if (!_gameState.SwitchBase(GameState.Loading, "New game"))
            {
                return;
            }

            SceneHandle scene = await _scenes.ChangeWorldSpaceAsync(new WorldSpaceRequest(_gameplaySceneKey, _gameplaySceneTitle, true), ct);
            if (!scene.IsValid)
            {
                await ReturnFromLoadingAsync(UiTexts.Format(UiTextKeys.LoadFailed, _gameplaySceneTitle), ct);
                return;
            }

            // One frame, so the objects of the new scene run Start (they register their saveables there).
            await _nextFrame(ct);
            LoadResult result = await _saves.NewGameAsync(new NewGameSettings(null), ct);
            if (!result.Success)
            {
                Log.Warning(LogCategory.UI, "New game reported a problem: " + result);
            }

            if (_gameState.Current == GameState.Loading)
            {
                _gameState.SwitchBase(GameState.Playing, "New game");
            }
        }

        private async Awaitable LoadFromMainMenuAsync(string slotId, CancellationToken ct)
        {
            _ui.Notifications.Clear();
            if (!_gameState.SwitchBase(GameState.Loading, "Load save"))
            {
                return;
            }

            ResolveScene(slotId, out string sceneKey, out string title);
            await LoadIntoSceneAsync(slotId, sceneKey, title, ct);
        }

        private async Awaitable LoadIntoSceneAsync(string slotId, string sceneKey, string title, CancellationToken ct)
        {
            // Game state is Loading: open the scene of the save's world space (village, crypt …), then load the save into it.
            SceneHandle scene = await _scenes.ChangeWorldSpaceAsync(new WorldSpaceRequest(sceneKey, title, true), ct);
            if (!scene.IsValid)
            {
                await ReturnFromLoadingAsync(UiTexts.Format(UiTextKeys.LoadFailed, title), ct);
                return;
            }

            await _nextFrame(ct);
            _loadingScreen.SetProgress(1f);
            LoadResult result = await _saves.LoadAsync(slotId, ct);
            if (!result.Success && _gameState.Current == GameState.Loading)
            {
                await ReturnFromLoadingAsync(UiTexts.Format(UiTextKeys.LoadFailed, SaveReasonKeys.ToGermanText(result.ReasonKey)), ct);
                return;
            }

            if (!result.Success)
            {
                Log.Warning(LogCategory.UI, "Load reported a problem: " + result);
            }

            if (_gameState.Current == GameState.Loading)
            {
                _gameState.SwitchBase(GameState.Playing, "Load save");
            }
        }

        private async Awaitable LoadInGameAsync(string slotId, CancellationToken ct)
        {
            ResolveScene(slotId, out string sceneKey, out string title);
            string current = CurrentSceneKey();
            if (!string.Equals(sceneKey, current, StringComparison.Ordinal))
            {
                // The save lies in another world space (e.g. a quick save in the crypt, loaded in the village): change the scene
                // behind the loading screen like a load from the main menu.
                Log.Info(LogCategory.UI, "Load '" + slotId + "' changes the world space: '" + current + "' -> '" + sceneKey + "'.");
                _ui.Notifications.Clear();
                if (!_gameState.SwitchBase(GameState.Loading, "Load save"))
                {
                    return;
                }

                await LoadIntoSceneAsync(slotId, sceneKey, title, ct);
                return;
            }

            _loadingScreen.Show(title);
            _loadingScreen.SetProgress(0.5f);
            try
            {
                LoadResult result = await _saves.LoadAsync(slotId, ct);
                _loadingScreen.SetProgress(1f);
                if (!result.Success)
                {
                    RaiseFailed(UiTexts.Format(UiTextKeys.LoadFailed, SaveReasonKeys.ToGermanText(result.ReasonKey)));
                }
            }
            finally
            {
                _loadingScreen.Hide();
            }
        }

        private async Awaitable ReturnToMainMenuAsync(CancellationToken ct)
        {
            if (!_gameState.SwitchBase(GameState.MainMenu, "Main menu"))
            {
                return;
            }

            _ui.Notifications.Clear();
            await _scenes.UnloadAsync(new SceneHandle(CurrentSceneKey()), ct);
        }

        /// <summary>The open world space scene (after a portal change e.g. the crypt), or the gameplay scene.</summary>
        private string CurrentSceneKey()
        {
            string current = _scenes.CurrentWorldSpace;
            return string.IsNullOrEmpty(current) ? _gameplaySceneKey : current;
        }

        /// <summary>Scene and loading screen title of the save's world space; unknown → the gameplay scene.</summary>
        private void ResolveScene(string slotId, out string sceneKey, out string title)
        {
            IReadOnlyList<SaveSlotInfo> slots = _saves.ListSlots(null);
            for (int i = 0; slots != null && i < slots.Count; i++)
            {
                if (string.Equals(slots[i].SlotId, slotId, StringComparison.Ordinal) &&
                    _worldSpaces.TryResolve(slots[i].WorldSpaceId, out sceneKey, out title))
                {
                    return;
                }
            }

            sceneKey = _gameplaySceneKey;
            title = _gameplaySceneTitle;
        }

        private async Awaitable ReturnFromLoadingAsync(string message, CancellationToken ct)
        {
            // Legal path of table 4.4 back to the main menu: Loading -> Playing -> Paused -> MainMenu.
            Log.Warning(LogCategory.UI, "Returning to the main menu: " + message);
            if (_gameState.Current == GameState.Loading)
            {
                _gameState.SwitchBase(GameState.Playing, "Load failed");
            }

            if (_gameState.Current == GameState.Playing)
            {
                _gameState.Push(GameState.Paused, "Load failed");
            }

            if (_gameState.Current == GameState.Paused)
            {
                _gameState.SwitchBase(GameState.MainMenu, "Load failed");
            }

            string scene = CurrentSceneKey();
            if (_scenes.IsLoaded(scene) && !_scenes.IsBusy)
            {
                await _scenes.UnloadAsync(new SceneHandle(scene), ct);
            }

            RaiseFailed(message);
        }

        private async void Run(Func<CancellationToken, Awaitable> operation, string what)
        {
            // async void: fire-and-forget adapter of a menu button; every exception is handled here.
            _busy = true;
            try
            {
                await operation(_cancellation);
            }
            catch (OperationCanceledException)
            {
                // The application is quitting.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.UI, exception, what + " failed.");
                LeaveLoadingState();
                RaiseFailed(what + ": " + exception.Message);
            }
            finally
            {
                if (_loadingScreen.IsVisible && _gameState.Current != GameState.Loading)
                {
                    _loadingScreen.Hide();
                }

                _busy = false;
            }
        }

        private void LeaveLoadingState()
        {
            // Never stay in Loading after an error: take the legal path back to the main menu.
            if (_gameState.Current != GameState.Loading)
            {
                return;
            }

            _gameState.SwitchBase(GameState.Playing, "Flow error");
            _gameState.Push(GameState.Paused, "Flow error");
            _gameState.SwitchBase(GameState.MainMenu, "Flow error");
        }

        private void RaiseFailed(string message)
        {
            Log.Warning(LogCategory.UI, message);
            Action<string> failed = Failed;
            if (failed != null)
            {
                failed(message);
            }
        }
    }
}
