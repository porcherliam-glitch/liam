// CHECK ONLY (DeadZone3D/Tools/check.sh) - signatures of com.unity.inputsystem 1.x that Dead Zone 3D uses.
// Never part of the Unity project; every member throws.
using System;
using UnityEngine.InputSystem.Controls;

namespace UnityEngine.InputSystem.Controls
{
    public class InputControl<TValue> where TValue : struct { public TValue ReadValue() => throw new NotSupportedException(); }
    public class ButtonControl : InputControl<float>
    {
        public bool isPressed => throw new NotSupportedException();
        public bool wasPressedThisFrame => throw new NotSupportedException();
        public bool wasReleasedThisFrame => throw new NotSupportedException();
    }
    public class KeyControl : ButtonControl { }
    public class Vector2Control : InputControl<Vector2> { }
    public class StickControl : Vector2Control { }
    public class DeltaControl : Vector2Control { }
    public class DpadControl : Vector2Control
    {
        public ButtonControl up => throw new NotSupportedException();
        public ButtonControl down => throw new NotSupportedException();
        public ButtonControl left => throw new NotSupportedException();
        public ButtonControl right => throw new NotSupportedException();
    }
}

namespace UnityEngine.InputSystem
{
    public enum Key
    {
        None, Space, Enter, Tab, Backquote, Quote, Semicolon, Comma, Period, Slash, Backslash, LeftBracket, RightBracket, Minus, Equals,
        A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
        Digit1, Digit2, Digit3, Digit4, Digit5, Digit6, Digit7, Digit8, Digit9, Digit0,
        LeftShift, RightShift, LeftAlt, RightAlt, LeftCtrl, RightCtrl, LeftMeta, RightMeta, ContextMenu, Escape,
        LeftArrow, RightArrow, UpArrow, DownArrow, Backspace, PageDown, PageUp, Home, End, Insert, Delete, CapsLock,
        F1 = 94, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
    }

    public class InputDevice { }

    public class Keyboard : InputDevice
    {
        public static Keyboard current => throw new NotSupportedException();
        public ButtonControl anyKey => throw new NotSupportedException();
        public KeyControl this[Key key] => throw new NotSupportedException();
    }

    public class Mouse : InputDevice
    {
        public static Mouse current => throw new NotSupportedException();
        public Vector2Control position => throw new NotSupportedException();
        public DeltaControl delta => throw new NotSupportedException();
        public DeltaControl scroll => throw new NotSupportedException();
        public ButtonControl leftButton => throw new NotSupportedException();
        public ButtonControl rightButton => throw new NotSupportedException();
        public ButtonControl middleButton => throw new NotSupportedException();
    }

    public class Gamepad : InputDevice
    {
        public static Gamepad current => throw new NotSupportedException();
        public StickControl leftStick => throw new NotSupportedException();
        public StickControl rightStick => throw new NotSupportedException();
        public ButtonControl leftTrigger => throw new NotSupportedException();
        public ButtonControl rightTrigger => throw new NotSupportedException();
        public ButtonControl leftShoulder => throw new NotSupportedException();
        public ButtonControl rightShoulder => throw new NotSupportedException();
        public ButtonControl buttonSouth => throw new NotSupportedException();
        public ButtonControl buttonEast => throw new NotSupportedException();
        public ButtonControl buttonWest => throw new NotSupportedException();
        public ButtonControl buttonNorth => throw new NotSupportedException();
        public ButtonControl startButton => throw new NotSupportedException();
        public ButtonControl selectButton => throw new NotSupportedException();
        public ButtonControl leftStickButton => throw new NotSupportedException();
        public ButtonControl rightStickButton => throw new NotSupportedException();
        public DpadControl dpad => throw new NotSupportedException();
    }
}
