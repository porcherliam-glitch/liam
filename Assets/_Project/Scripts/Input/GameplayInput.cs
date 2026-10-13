using System;
using Aetherfall.Events;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Utilities;

namespace Aetherfall.Input
{
    /// <summary>
    /// Input System implementation of <see cref="IGameplayInput"/>: resolves the actions of the Gameplay map once and reads
    /// them without allocations.
    /// </summary>
    public sealed class GameplayInput : IGameplayInput
    {
        private readonly InputActionMap _map;
        private readonly InputAction _move;
        private readonly InputAction _look;
        private readonly InputAction _switchTarget;
        private readonly InputAction[] _buttons;

        /// <summary>Resolves all Gameplay actions (throws if one is missing).</summary>
        /// <param name="actions">The action instance of the input service.</param>
        public GameplayInput(GameInputActions actions)
        {
            if (actions == null)
            {
                throw new ArgumentNullException(nameof(actions));
            }

            _map = actions.Gameplay;
            _move = _map.FindAction(InputActionNames.Gameplay.Move, true);
            _look = _map.FindAction(InputActionNames.Gameplay.Look, true);
            _switchTarget = _map.FindAction(InputActionNames.Gameplay.SwitchTarget, true);

            Array values = Enum.GetValues(typeof(GameplayButton));
            int count = 0;
            foreach (object value in values)
            {
                count = Math.Max(count, (int)value + 1);
            }

            _buttons = new InputAction[count];
            foreach (object value in values)
            {
                var button = (GameplayButton)value;
                _buttons[(int)button] = _map.FindAction(InputActionNames.ForButton(button), true);
            }
        }

        /// <inheritdoc />
        public bool IsActive => _map.enabled;

        /// <inheritdoc />
        public Vector2 Move => _move.ReadValue<Vector2>();

        /// <inheritdoc />
        public Vector2 Look => _look.ReadValue<Vector2>();

        /// <inheritdoc />
        public bool LookIsPointerDelta
        {
            get
            {
                InputControl control = _look.activeControl;
                return control != null && control.device is Pointer;
            }
        }

        /// <inheritdoc />
        public float SwitchTarget => _switchTarget.ReadValue<float>();

        /// <inheritdoc />
        public bool WasPressedThisFrame(GameplayButton button)
        {
            return Get(button).WasPressedThisFrame();
        }

        /// <inheritdoc />
        public bool WasPerformedThisFrame(GameplayButton button)
        {
            return Get(button).WasPerformedThisFrame();
        }

        /// <inheritdoc />
        public bool WasToggledThisFrame(GameplayButton button)
        {
            InputAction action = Get(button);
            bool lockState = KeyboardPlatformRules.LockKeysReportLockState;
            // The release is read from the key itself, not from the action: a button action does not adopt a key that is
            // already held when the map is enabled (Caps Lock on after a pause), so it would miss that release.
            bool lockKeyReleased = lockState && _map.enabled && WasLockKeyReleasedThisFrame(action);
            return KeyboardPlatformRules.IsToggle(action.WasPressedThisFrame(), lockKeyReleased, lockState);
        }

        /// <inheritdoc />
        public bool WasReleasedThisFrame(GameplayButton button)
        {
            return Get(button).WasReleasedThisFrame();
        }

        /// <inheritdoc />
        public bool IsPressed(GameplayButton button)
        {
            return Get(button).IsPressed();
        }

        /// <inheritdoc />
        public DeviceKind SourceDeviceOf(GameplayButton button)
        {
            InputControl control = Get(button).activeControl;
            if (control == null)
            {
                return DeviceKind.Unknown;
            }

            InputDevice device = control.device;
            if (device is Gamepad)
            {
                return DeviceKind.Gamepad;
            }

            return device is Keyboard || device is Pointer ? DeviceKind.KeyboardMouse : DeviceKind.Unknown;
        }

        private static bool WasLockKeyReleasedThisFrame(InputAction action)
        {
            ReadOnlyArray<InputControl> controls = action.controls;
            for (int i = 0; i < controls.Count; i++)
            {
                if (controls[i] is KeyControl key && key.keyCode == Key.CapsLock && key.wasReleasedThisFrame)
                {
                    return true;
                }
            }

            return false;
        }

        private InputAction Get(GameplayButton button)
        {
            int index = (int)button;
            if (index < 0 || index >= _buttons.Length || _buttons[index] == null)
            {
                throw new ArgumentOutOfRangeException(nameof(button), button, "Unknown gameplay button.");
            }

            return _buttons[index];
        }
    }
}
