using System.Collections.Generic;
using Aetherfall.Events;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Utilities;

namespace Aetherfall.Input
{
    /// <summary>
    /// Thin Input System adapter of the device detection (architecture 11.1 "device detection"): looks once per frame at the
    /// keyboard, the mouse and all gamepads and reports qualifying activity to an <see cref="ActiveDeviceTracker"/>
    /// (GDD 05 1.5: any key or button press, a stick crossing 50 %, mouse movement). Independent of the enabled action
    /// maps, so the glyphs also switch in menus.
    /// </summary>
    /// <remarks>Allocation-free per frame, except for the first sighting of a new gamepad (glyph family cache).</remarks>
    public sealed class InputDeviceActivityPoller
    {
        private const float StickThresholdSquared = 0.5f * 0.5f;

        private readonly Dictionary<int, GlyphFamily> _familyByDeviceId = new Dictionary<int, GlyphFamily>();
        private readonly HashSet<int> _sticksAboveThreshold = new HashSet<int>();

        /// <summary>Reports this frame's activity to the tracker.</summary>
        /// <param name="tracker">Tracker that decides the active device.</param>
        /// <param name="time">Current unscaled time in seconds.</param>
        /// <returns>True if the active device kind or glyph family changed.</returns>
        public bool Poll(ActiveDeviceTracker tracker, double time)
        {
            bool changed = false;

            ReadOnlyArray<Gamepad> gamepads = Gamepad.all;
            for (int i = 0; i < gamepads.Count; i++)
            {
                Gamepad gamepad = gamepads[i];
                if (HasGamepadActivity(gamepad))
                {
                    changed |= tracker.ReportActivity(DeviceKind.Gamepad, GetFamily(gamepad), time);
                }
            }

            Keyboard keyboard = Keyboard.current;
            if (keyboard != null && AnyKeyPressedThisFrame(keyboard))
            {
                changed |= tracker.ReportActivity(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse, time);
            }

            Mouse mouse = Mouse.current;
            if (mouse != null)
            {
                if (mouse.leftButton.wasPressedThisFrame || mouse.rightButton.wasPressedThisFrame ||
                    mouse.middleButton.wasPressedThisFrame || mouse.scroll.ReadValue().sqrMagnitude > 0f)
                {
                    changed |= tracker.ReportActivity(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse, time);
                }

                changed |= tracker.ReportPointerMotion(mouse.delta.ReadValue().magnitude, time);
            }

            return changed;
        }

        private static bool AnyKeyPressedThisFrame(Keyboard keyboard)
        {
            // Not keyboard.anyKey: on macOS it never reports a press while Caps Lock is on (Input System issue ISXB-1748,
            // see KeyboardPlatformRules); the single keys are not affected.
            ReadOnlyArray<KeyControl> keys = keyboard.allKeys;
            for (int i = 0; i < keys.Count; i++)
            {
                KeyControl key = keys[i];
                if (key != null && key.wasPressedThisFrame)
                {
                    return true;
                }
            }

            return false;
        }

        private bool HasGamepadActivity(Gamepad gamepad)
        {
            // Sticks: only the moment one crosses 50 % counts (holding a stick does not fight a keyboard press).
            bool above = gamepad.leftStick.ReadValue().sqrMagnitude > StickThresholdSquared ||
                         gamepad.rightStick.ReadValue().sqrMagnitude > StickThresholdSquared;
            bool crossed = above && _sticksAboveThreshold.Add(gamepad.deviceId);
            if (!above)
            {
                _sticksAboveThreshold.Remove(gamepad.deviceId);
            }

            if (crossed)
            {
                return true;
            }

            // Buttons, triggers, D-pad (the stick direction buttons are skipped: covered above).
            ReadOnlyArray<InputControl> controls = gamepad.allControls;
            for (int i = 0; i < controls.Count; i++)
            {
                if (controls[i] is ButtonControl button && button.wasPressedThisFrame && !IsStickDirection(button, gamepad))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsStickDirection(InputControl control, Gamepad gamepad)
        {
            InputControl parent = control.parent;
            return parent == gamepad.leftStick || parent == gamepad.rightStick;
        }

        private GlyphFamily GetFamily(Gamepad gamepad)
        {
            if (!_familyByDeviceId.TryGetValue(gamepad.deviceId, out GlyphFamily family))
            {
                family = DeviceClassifier.ClassifyGamepad(gamepad.layout, gamepad.description.product, gamepad.description.manufacturer);
                _familyByDeviceId.Add(gamepad.deviceId, family);
            }

            return family;
        }
    }
}
