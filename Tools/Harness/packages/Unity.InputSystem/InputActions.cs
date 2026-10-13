// HARNESS ONLY - stubs of InputActionType, InputAction, InputActionMap, InputActionAsset, InputControlScheme and
// InputBinding (com.unity.inputsystem 1.x). Only the members the Aetherfall code uses, with the real signatures.
using System;
using UnityEngine.InputSystem.Utilities;

namespace UnityEngine.InputSystem
{
    public enum InputActionType
    {
        Value,
        Button,
        PassThrough
    }

    public enum InputActionPhase
    {
        Disabled,
        Waiting,
        Started,
        Performed,
        Canceled
    }

    public sealed class InputAction : IDisposable
    {
        public InputAction(string name = null, InputActionType type = default, string binding = null, string interactions = null,
            string processors = null, string expectedControlType = null)
        {
        }

        public string name => throw HarnessStub.NotSupported();
        public InputActionType type => throw HarnessStub.NotSupported();
        public Guid id => throw HarnessStub.NotSupported();
        public string expectedControlType { get; set; }
        public InputActionMap actionMap => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputBinding> bindings => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputControl> controls => throw HarnessStub.NotSupported();
        public InputActionPhase phase => throw HarnessStub.NotSupported();
        public bool inProgress => throw HarnessStub.NotSupported();
        public bool enabled => throw HarnessStub.NotSupported();
        public bool triggered => throw HarnessStub.NotSupported();
        public InputControl activeControl => throw HarnessStub.NotSupported();

        public event Action<CallbackContext> started;
        public event Action<CallbackContext> canceled;
        public event Action<CallbackContext> performed;

        public void Enable() { throw HarnessStub.NotSupported(); }
        public void Disable() { throw HarnessStub.NotSupported(); }
        public TValue ReadValue<TValue>() where TValue : struct { throw HarnessStub.NotSupported(); }
        public object ReadValueAsObject() { throw HarnessStub.NotSupported(); }
        public bool IsPressed() { throw HarnessStub.NotSupported(); }
        public bool IsInProgress() { throw HarnessStub.NotSupported(); }
        public bool WasPressedThisFrame() { throw HarnessStub.NotSupported(); }
        public bool WasReleasedThisFrame() { throw HarnessStub.NotSupported(); }
        public bool WasPerformedThisFrame() { throw HarnessStub.NotSupported(); }
        public void Dispose() { throw HarnessStub.NotSupported(); }

        public struct CallbackContext
        {
            public InputActionPhase phase => throw HarnessStub.NotSupported();
            public bool started => throw HarnessStub.NotSupported();
            public bool performed => throw HarnessStub.NotSupported();
            public bool canceled => throw HarnessStub.NotSupported();
            public InputAction action => throw HarnessStub.NotSupported();
            public InputControl control => throw HarnessStub.NotSupported();
            public double time => throw HarnessStub.NotSupported();
            public TValue ReadValue<TValue>() where TValue : struct { throw HarnessStub.NotSupported(); }
            public bool ReadValueAsButton() { throw HarnessStub.NotSupported(); }
        }
    }

    public sealed class InputActionMap : IDisposable
    {
        public InputActionMap(string name = null)
        {
        }

        public string name => throw HarnessStub.NotSupported();
        public InputActionAsset asset => throw HarnessStub.NotSupported();
        public Guid id => throw HarnessStub.NotSupported();
        public bool enabled => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputAction> actions => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputBinding> bindings => throw HarnessStub.NotSupported();

        public event Action<InputAction.CallbackContext> actionTriggered;

        public InputAction FindAction(string actionNameOrId, bool throwIfNotFound = false) { throw HarnessStub.NotSupported(); }
        public void Enable() { throw HarnessStub.NotSupported(); }
        public void Disable() { throw HarnessStub.NotSupported(); }
        public void Dispose() { throw HarnessStub.NotSupported(); }
    }

    public class InputActionAsset : ScriptableObject
    {
        public const string Extension = "inputactions";
        public bool enabled => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputActionMap> actionMaps => throw HarnessStub.NotSupported();
        public ReadOnlyArray<InputControlScheme> controlSchemes => throw HarnessStub.NotSupported();

        public string ToJson() { throw HarnessStub.NotSupported(); }
        public void LoadFromJson(string json) { throw HarnessStub.NotSupported(); }
        public static InputActionAsset FromJson(string json) { throw HarnessStub.NotSupported(); }
        public InputAction FindAction(string actionNameOrId, bool throwIfNotFound = false) { throw HarnessStub.NotSupported(); }
        public InputActionMap FindActionMap(string nameOrId, bool throwIfNotFound = false) { throw HarnessStub.NotSupported(); }
        public void Enable() { throw HarnessStub.NotSupported(); }
        public void Disable() { throw HarnessStub.NotSupported(); }
    }

    public struct InputControlScheme
    {
        public string name => throw HarnessStub.NotSupported();
        public string bindingGroup { get; set; }
    }

    public struct InputBinding
    {
        public string name { get; set; }
        public string path { get; set; }
        public string overridePath { get; set; }
        public string interactions { get; set; }
        public string processors { get; set; }
        public string groups { get; set; }
        public string action { get; set; }
        public bool isComposite { get; set; }
        public bool isPartOfComposite { get; set; }
        public string effectivePath => throw HarnessStub.NotSupported();
    }
}
