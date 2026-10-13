using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Aetherfall.Input
{
    /// <summary>
    /// Default <see cref="IInputService"/> (architecture 11.1). Pure C# service: created by <see cref="InputInstaller"/>,
    /// subscribes in <see cref="PostInitialize"/>, ticked by the central TickRunner, unsubscribes in <see cref="Dispose"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>Map switching:</b> on every <see cref="GameStateChanged"/> exactly the map of <see cref="ActionMapTable"/> is
    /// enabled; the Gameplay map is never enabled in menus. The cursor follows <see cref="CursorPolicy"/>.</para>
    /// <para><b>Device detection:</b> <see cref="InputDeviceActivityPoller"/> + <see cref="ActiveDeviceTracker"/> (GDD 05 1.5);
    /// <see cref="InputDeviceChanged"/> is published only when the kind or glyph family changes.</para>
    /// <para><b>Pause button:</b> while no pause menu exists, the service routes Start/Esc to the game state
    /// (<see cref="PauseRouting"/>): Pause of the Gameplay/Dialog/Riding map pushes Paused, CloseHub or Cancel of the UI map
    /// pops it. Switched off in the InputInstaller once the pause screen handles it.</para>
    /// <para>TODO (Options step): load binding overrides from settings.json before the first enable (boot step 6),
    /// sensitivity/invert/dead-zone options, rumble service.</para>
    /// </remarks>
    public sealed class InputService : IInputService, IPostInitializable, ITickable, IDisposable
    {
        private readonly IEventBus _eventBus;
        private readonly IGameStateService _gameState;
        private readonly GameInputActions _actions;
        private readonly ICursorController _cursor;
        private readonly bool _routePauseButton;
        private readonly GameplayInput _gameplay;
        private readonly UiInput _ui;
        private readonly ActiveDeviceTracker _deviceTracker = new ActiveDeviceTracker();
        private readonly InputDeviceActivityPoller _devicePoller = new InputDeviceActivityPoller();
        private readonly InputAction[] _pauseActions;
        private readonly InputAction[] _resumeActions;
        private PlayerControlMode _controlMode = PlayerControlMode.OnFoot;
        private ActionMapId _activeMap = ActionMapId.None;
        private bool _subscribed;
        private bool _disposed;

        /// <summary>Creates the service. No map is enabled until <see cref="PostInitialize"/>.</summary>
        /// <param name="eventBus">Bus for <see cref="GameStateChanged"/> and <see cref="InputDeviceChanged"/>.</param>
        /// <param name="gameState">Game state service (current state, pause push/pop).</param>
        /// <param name="actions">The action instance; the service takes ownership and disposes it.</param>
        /// <param name="cursor">Cursor adapter; null leaves the cursor alone.</param>
        /// <param name="routePauseButton">True: Start/Esc pauses and resumes the game (until a pause menu exists).</param>
        public InputService(IEventBus eventBus, IGameStateService gameState, GameInputActions actions, ICursorController cursor,
            bool routePauseButton)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _cursor = cursor;
            _routePauseButton = routePauseButton;
            _gameplay = new GameplayInput(actions);
            _ui = new UiInput(actions);
            _pauseActions = new[]
            {
                actions.GetAction(ActionMapId.Gameplay, InputActionNames.Gameplay.Pause),
                actions.GetAction(ActionMapId.Dialog, InputActionNames.Dialog.Pause),
                actions.GetAction(ActionMapId.Riding, InputActionNames.Riding.Pause)
            };
            _resumeActions = new[]
            {
                actions.GetAction(ActionMapId.UI, InputActionNames.UI.CloseHub),
                actions.GetAction(ActionMapId.UI, InputActionNames.UI.Cancel)
            };
        }

        /// <inheritdoc />
        public IGameplayInput Gameplay => _gameplay;

        /// <inheritdoc />
        public IUiInput UI => _ui;

        /// <inheritdoc />
        public GameInputActions Actions => _actions;

        /// <inheritdoc />
        public ActionMapId ActiveMap => _activeMap;

        /// <inheritdoc />
        public DeviceKind ActiveDeviceKind => _deviceTracker.Kind;

        /// <inheritdoc />
        public GlyphFamily ActiveGlyphFamily => _deviceTracker.Family;

        /// <inheritdoc />
        public PlayerControlMode ControlMode => _controlMode;

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_disposed || _subscribed)
            {
                return;
            }

            _eventBus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _subscribed = true;
            Apply(_gameState.Current);
            Log.Info(LogCategory.Input, "InputService ready: maps " + DescribeMaps() + ", pause button routing " +
                                        (_routePauseButton ? "on" : "off") + ", active map " + _activeMap + ".");
        }

        /// <inheritdoc />
        public void SetControlMode(PlayerControlMode mode)
        {
            if (_controlMode == mode)
            {
                return;
            }

            _controlMode = mode;
            if (!_disposed && _subscribed)
            {
                Apply(_gameState.Current);
            }
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (_disposed)
            {
                return;
            }

            // Unscaled time: the hysteresis must also work while the game is paused (time scale 0).
            if (_devicePoller.Poll(_deviceTracker, Time.unscaledTimeAsDouble))
            {
                var changed = new InputDeviceChanged(_deviceTracker.Kind, _deviceTracker.Family);
                Log.Debug(LogCategory.Input, "Active device: " + changed.DeviceKind + " (" + changed.GlyphFamily + ").");
                _eventBus.Publish(in changed);
            }

            if (_routePauseButton)
            {
                RoutePauseButton();
            }
        }

        /// <summary>Unsubscribes, disables all maps, frees the cursor and destroys the action asset.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            if (_subscribed)
            {
                _eventBus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
                _subscribed = false;
            }

            _activeMap = ActionMapId.None;
            if (_cursor != null)
            {
                _cursor.SetLocked(false);
            }

            _actions.Dispose();
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            Apply(evt.Current);
        }

        private void Apply(GameState state)
        {
            ActionMapId map = ActionMapTable.For(state, _controlMode);
            if (map != _activeMap)
            {
                Log.Debug(LogCategory.Input, "Action map " + _activeMap + " -> " + map + " (" + state + ", " + _controlMode + ").");
            }

            _activeMap = map;
            _actions.EnableOnly(map);
            if (_cursor != null)
            {
                _cursor.SetLocked(CursorPolicy.ShouldLockCursor(state));
            }
        }

        private void RoutePauseButton()
        {
            PauseCommand command = PauseRouting.Resolve(_gameState.Current, AnyPressed(_pauseActions), AnyPressed(_resumeActions));
            switch (command)
            {
                case PauseCommand.PushPaused:
                    _gameState.Push(GameState.Paused, "Pause button");
                    break;
                case PauseCommand.PopPaused:
                    _gameState.Pop(GameState.Paused);
                    break;
            }
        }

        private static bool AnyPressed(InputAction[] actions)
        {
            for (int i = 0; i < actions.Length; i++)
            {
                if (actions[i].WasPressedThisFrame())
                {
                    return true;
                }
            }

            return false;
        }

        private string DescribeMaps()
        {
            string text = string.Empty;
            for (int i = (int)ActionMapId.Gameplay; i <= (int)ActionMapId.Building; i++)
            {
                InputActionMap map = _actions.GetMap((ActionMapId)i);
                text += (text.Length > 0 ? ", " : string.Empty) + map.name + " (" + map.actions.Count + ")";
            }

            return text;
        }
    }
}
