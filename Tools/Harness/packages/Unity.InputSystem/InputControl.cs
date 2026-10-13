// HARNESS ONLY - stub of UnityEngine.InputSystem.InputControl / InputControl<TValue> (com.unity.inputsystem 1.x).
using UnityEngine.InputSystem.Utilities;

namespace UnityEngine.InputSystem
{
    public abstract class InputControl
    {
        public string name => throw HarnessStub.NotSupported();
        public string displayName => throw HarnessStub.NotSupported();
        public string shortDisplayName => throw HarnessStub.NotSupported();
        public string path => throw HarnessStub.NotSupported();
        public string layout => throw HarnessStub.NotSupported();
        public InputDevice device => throw HarnessStub.NotSupported();
        public InputControl parent => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputControl> children => throw HarnessStub.NotSupported();
        public bool synthetic => throw HarnessStub.NotSupported();
        public bool noisy => throw HarnessStub.NotSupported();
        public float magnitude => throw HarnessStub.NotSupported();
        public float EvaluateMagnitude() { throw HarnessStub.NotSupported(); }
        public object ReadValueAsObject() { throw HarnessStub.NotSupported(); }
    }

    public abstract class InputControl<TValue> : InputControl where TValue : struct
    {
        public TValue value => throw HarnessStub.NotSupported();
        public TValue ReadValue() { throw HarnessStub.NotSupported(); }
        public TValue ReadDefaultValue() { throw HarnessStub.NotSupported(); }
    }
}
