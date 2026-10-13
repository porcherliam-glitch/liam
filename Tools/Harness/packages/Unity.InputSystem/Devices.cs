// HARNESS ONLY - stubs of the device classes of com.unity.inputsystem 1.x (InputDevice, Gamepad, Keyboard, Pointer, Mouse).
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Layouts;
using UnityEngine.InputSystem.Utilities;

namespace UnityEngine.InputSystem
{
    public class InputDevice : InputControl
    {
        public const int InvalidDeviceId = 0;
        public InputDeviceDescription description => throw HarnessStub.NotSupported();
        public bool enabled => throw HarnessStub.NotSupported();
        public bool canRunInBackground => throw HarnessStub.NotSupported();
        public bool added => throw HarnessStub.NotSupported();
        public bool remote => throw HarnessStub.NotSupported();
        public bool native => throw HarnessStub.NotSupported();
        public bool updateBeforeRender => throw HarnessStub.NotSupported();
        public int deviceId => throw HarnessStub.NotSupported();
        public double lastUpdateTime => throw HarnessStub.NotSupported();
        public bool wasUpdatedThisFrame => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputControl> allControls => throw HarnessStub.NotSupported();
        public virtual void MakeCurrent() { throw HarnessStub.NotSupported(); }
    }

    public class Gamepad : InputDevice
    {
        public ButtonControl buttonWest { get; protected set; }
        public ButtonControl buttonNorth { get; protected set; }
        public ButtonControl buttonSouth { get; protected set; }
        public ButtonControl buttonEast { get; protected set; }
        public ButtonControl leftStickButton { get; protected set; }
        public ButtonControl rightStickButton { get; protected set; }
        public ButtonControl startButton { get; protected set; }
        public ButtonControl selectButton { get; protected set; }
        public DpadControl dpad { get; protected set; }
        public ButtonControl leftShoulder { get; protected set; }
        public ButtonControl rightShoulder { get; protected set; }
        public StickControl leftStick { get; protected set; }
        public StickControl rightStick { get; protected set; }
        public ButtonControl leftTrigger { get; protected set; }
        public ButtonControl rightTrigger { get; protected set; }
        public static Gamepad current => throw HarnessStub.NotSupported();
        public static ReadOnlyArray<Gamepad> all => throw HarnessStub.NotSupported();
    }

    // Only the members the Aetherfall code uses, with the real values of Input System 1.14.2 (Devices/Keyboard.cs).
    public enum Key
    {
        None = 0,
        CapsLock = 72
    }

    public class Keyboard : InputDevice
    {
        public AnyKeyControl anyKey { get; protected set; }
        public ReadOnlyArray<KeyControl> allKeys => throw HarnessStub.NotSupported();
        public KeyControl capsLockKey => throw HarnessStub.NotSupported();
        public static Keyboard current => throw HarnessStub.NotSupported();
    }

    public class Pointer : InputDevice
    {
        public Vector2Control position { get; protected set; }
        public DeltaControl delta { get; protected set; }
        public ButtonControl press { get; protected set; }
        public static Pointer current => throw HarnessStub.NotSupported();
    }

    public class Mouse : Pointer
    {
        public DeltaControl scroll { get; protected set; }
        public ButtonControl leftButton { get; protected set; }
        public ButtonControl middleButton { get; protected set; }
        public ButtonControl rightButton { get; protected set; }
        public ButtonControl backButton { get; protected set; }
        public ButtonControl forwardButton { get; protected set; }
        public new static Mouse current => throw HarnessStub.NotSupported();
    }
}
