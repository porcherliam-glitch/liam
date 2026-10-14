using System;
using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Keeps the screens in step with the game state (architecture 4.4): main menu in <c>MainMenu</c>, HUD in the game, pause
    /// menu while <c>Paused</c>, death screen after <c>PlayerDied</c>; pushes <c>Paused</c> when the pause button (Start /
    /// Esc) is pressed where table 4.4 allows it (Playing, Dialogue; also while riding). Messages are buffered in menus
    /// (GDD 05 1.7).
    /// </summary>
    /// <remarks>
    /// <para>The game state is the single source of truth: screens open and close because the state changed, and the menu
    /// actions change the state (resume = <c>Pop(Paused)</c>), never the other way round.</para>
    /// <para><b>Death screen:</b> shown <c>deathScreenDelay</c> seconds after <c>PlayerDied</c> as a <c>Paused</c> modal (time
    /// stops, the UI map is active, no autosave). Paused was chosen because both of its choices are legal transitions from
    /// there: Paused → Loading (load the last save) and Pop → Playing (respawn). The death screen is not in table 4.4; this is
    /// documented in the guide 07. If the player dies in a state without Paused (cutscene, loading), the death screen waits
    /// and is tried again every frame; in a dialogue it stacks over the dialogue (Dialogue → Paused).</para>
    /// </remarks>
    public sealed class UiStateDirector
    {
        private const string PauseReason = "Pause menu";
        private const string DeathReason = "Death screen";

        private readonly IUIManager _ui;
        private readonly IGameStateService _gameState;
        private readonly IGameplayInput _gameplay;
        private readonly Func<bool> _pausePressed;
        private readonly IGameFlow _flow;
        private readonly UIScreen _mainMenu;
        private readonly UIScreen _pauseMenu;
        private readonly UIScreen _deathScreen;
        private readonly float _deathDelay;
        private bool _deathPending;
        private float _deathTimer;

        /// <summary>Creates the director.</summary>
        /// <param name="ui">UI manager.</param>
        /// <param name="gameState">Game state service.</param>
        /// <param name="gameplay">Gameplay map reader (HUD peek); may be null.</param>
        /// <param name="pausePressed">
        /// True if the pause button of the active player map (Gameplay, Dialog, Riding) was pressed this frame
        /// (<see cref="IInputService.WasPausePressedThisFrame"/>); may be null (no pause button).
        /// </param>
        /// <param name="flow">Game flow.</param>
        /// <param name="mainMenu">Main menu (<see cref="MainMenuScreen"/>; shows flow errors if it is an <see cref="IErrorDisplay"/>).</param>
        /// <param name="pauseMenu">Pause menu (<see cref="PauseMenuScreen"/>).</param>
        /// <param name="deathScreen">Death screen (<see cref="DeathScreen"/>).</param>
        /// <param name="deathDelay">Seconds between death and death screen.</param>
        public UiStateDirector(IUIManager ui, IGameStateService gameState, IGameplayInput gameplay, Func<bool> pausePressed, IGameFlow flow,
            UIScreen mainMenu, UIScreen pauseMenu, UIScreen deathScreen, float deathDelay)
        {
            _ui = ui ?? throw new ArgumentNullException(nameof(ui));
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            _gameplay = gameplay;
            _pausePressed = pausePressed;
            _flow = flow ?? throw new ArgumentNullException(nameof(flow));
            _mainMenu = mainMenu ?? throw new ArgumentNullException(nameof(mainMenu));
            _pauseMenu = pauseMenu ?? throw new ArgumentNullException(nameof(pauseMenu));
            _deathScreen = deathScreen ?? throw new ArgumentNullException(nameof(deathScreen));
            _deathDelay = Math.Max(0f, deathDelay);
        }

        /// <summary>True between the player's death and respawn or load.</summary>
        public bool DeathPending => _deathPending;

        /// <summary>True if the HUD peek action (hold Select / M) fired this frame.</summary>
        public bool PeekRequested => _gameplay != null && _gameplay.IsActive && _gameplay.WasPressedThisFrame(GameplayButton.HudPeek);

        /// <summary>Applies the screens of a game state (on every GameStateChanged and once at start).</summary>
        /// <param name="state">Current game state.</param>
        public void Apply(GameState state)
        {
            _ui.SetLayerVisible(UILayer.Hud, UiFlowRules.ShowsHud(state));
            _ui.Notifications.SetSuppressed(UiFlowRules.SuppressesNotifications(state));
            switch (state)
            {
                case GameState.MainMenu:
                    _deathPending = false;
                    Close(_pauseMenu);
                    Close(_deathScreen);
                    _ui.Notifications.Clear();
                    if (!_mainMenu.IsOpen)
                    {
                        _ui.Open(_mainMenu);
                    }

                    break;
                case GameState.Paused:
                    Close(_mainMenu);
                    if (_deathPending && _deathTimer <= 0f)
                    {
                        Close(_pauseMenu);
                        if (!_deathScreen.IsOpen)
                        {
                            _ui.Open(_deathScreen);
                        }
                    }
                    else if (!_pauseMenu.IsOpen)
                    {
                        Close(_deathScreen);
                        _ui.Open(_pauseMenu);
                    }

                    break;
                default:
                    Close(_mainMenu);
                    Close(_pauseMenu);
                    Close(_deathScreen);
                    break;
            }
        }

        /// <summary>Per frame: pause button and the death screen (delay, then until it is open).</summary>
        /// <param name="unscaledDeltaTime">Unscaled frame time in seconds.</param>
        public void Update(float unscaledDeltaTime)
        {
            if (_deathPending)
            {
                if (_deathTimer > 0f)
                {
                    _deathTimer -= unscaledDeltaTime;
                    if (_deathTimer > 0f)
                    {
                        return;
                    }

                    _deathTimer = 0f;
                }

                // Tried every frame until it is open: a cutscene or a loading screen may hold it back.
                if (!_deathScreen.IsOpen)
                {
                    ShowDeathScreen();
                }

                return;
            }

            // Same rule as the stand-in routing of the input service (PauseRouting): Playing and Dialogue may push Paused.
            // A save that is being written does not block it (IsFlowRunning, not IsBusy).
            bool pressed = _pausePressed != null && _pausePressed();
            if (pressed && PauseRouting.Resolve(_gameState.Current, true, false) == PauseCommand.PushPaused && !_flow.IsFlowRunning)
            {
                _gameState.Push(GameState.Paused, PauseReason);
            }
        }

        /// <summary>The player died (PlayerDied): the death screen follows after the delay.</summary>
        public void OnPlayerDied()
        {
            _deathPending = true;
            _deathTimer = Math.Max(0.0001f, _deathDelay);
        }

        /// <summary>A save was loaded (GameLoaded): a pending death is over.</summary>
        public void OnGameLoaded()
        {
            _deathPending = false;
            _deathTimer = 0f;
        }

        /// <summary>Death screen: "Letzten Stand laden".</summary>
        public void LoadLastSave()
        {
            if (_flow.TryGetLatestSave(out SaveSlotInfo slot))
            {
                _flow.LoadSlot(slot.SlotId);
            }
        }

        /// <summary>Death screen: "Am Spawnpunkt wiederbeleben".</summary>
        public void RespawnAtSpawnPoint()
        {
            _deathPending = false;
            _deathTimer = 0f;
            _flow.RespawnAtSpawnPoint();
        }

        /// <summary>Shows a failure message of the game flow on the open menu, otherwise as a message.</summary>
        /// <param name="message">German text.</param>
        public void ShowFailure(string message)
        {
            UIScreen open = _mainMenu.IsOpen ? _mainMenu : _deathScreen.IsOpen ? _deathScreen : _pauseMenu.IsOpen ? _pauseMenu : null;
            if (open is IErrorDisplay display)
            {
                display.ShowError(message);
            }
            else
            {
                _ui.ShowToast(Notification.Warning(message));
            }
        }

        private void ShowDeathScreen()
        {
            GameState current = _gameState.Current;
            if (current == GameState.Paused)
            {
                // The pause menu was open when the player died (e.g. debug damage): replace it by the death screen.
                Close(_pauseMenu);
                Apply(current);
                return;
            }

            if (current == GameState.Menu || current == GameState.Building)
            {
                _gameState.Pop(current);
            }

            // Playing, or Dialogue (Paused stacks over it, table 4.4). Cutscene and Loading allow no Paused: wait, the next
            // frame tries again.
            if (GameStateTransitions.CanPush(_gameState.Current, GameState.Paused))
            {
                _gameState.Push(GameState.Paused, DeathReason);
            }
        }

        private void Close(UIScreen screen)
        {
            if (screen.IsOpen)
            {
                _ui.Close(screen);
            }
        }
    }
}
