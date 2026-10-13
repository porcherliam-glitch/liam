// HARNESS ONLY - stubs of UnityEngine.InputSystem.Controls (com.unity.inputsystem 1.x).
namespace UnityEngine.InputSystem.Controls
{
    public class AxisControl : InputControl<float>
    {
    }

    public class ButtonControl : AxisControl
    {
        public float pressPoint;
        public float pressPointOrDefault => throw HarnessStub.NotSupported();
        public bool isPressed => throw HarnessStub.NotSupported();
        public bool wasPressedThisFrame => throw HarnessStub.NotSupported();
        public bool wasReleasedThisFrame => throw HarnessStub.NotSupported();
        public bool IsValueConsideredPressed(float value) { throw HarnessStub.NotSupported(); }
    }

    public class AnyKeyControl : ButtonControl
    {
    }

    public class KeyControl : ButtonControl
    {
        public Key keyCode { get; set; }
        public int scanCode => throw HarnessStub.NotSupported();
    }

    public class Vector2Control : InputControl<Vector2>
    {
        public AxisControl x { get; set; }
        public AxisControl y { get; set; }
    }

    public class StickControl : Vector2Control
    {
        public ButtonControl up { get; set; }
        public ButtonControl down { get; set; }
        public ButtonControl left { get; set; }
        public ButtonControl right { get; set; }
    }

    public class DeltaControl : Vector2Control
    {
        public ButtonControl up { get; set; }
        public ButtonControl down { get; set; }
        public ButtonControl left { get; set; }
        public ButtonControl right { get; set; }
    }

    public class DpadControl : Vector2Control
    {
        public ButtonControl up { get; set; }
        public ButtonControl down { get; set; }
        public ButtonControl left { get; set; }
        public ButtonControl right { get; set; }
    }
}
