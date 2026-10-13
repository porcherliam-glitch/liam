// HARNESS ONLY - stub of UnityEngine.InputSystem.InputActionSetupExtensions (com.unity.inputsystem 1.x).
// Signatures checked against InputActionSetupExtensions.cs of Input System 1.11.2.
namespace UnityEngine.InputSystem
{
    public static class InputActionSetupExtensions
    {
        public static InputActionMap AddActionMap(this InputActionAsset asset, string name) { throw HarnessStub.NotSupported(); }

        public static void AddActionMap(this InputActionAsset asset, InputActionMap map) { throw HarnessStub.NotSupported(); }

        public static InputAction AddAction(this InputActionMap map, string name, InputActionType type = default, string binding = null,
            string interactions = null, string processors = null, string groups = null, string expectedControlLayout = null)
        {
            throw HarnessStub.NotSupported();
        }

        public static BindingSyntax AddBinding(this InputAction action, string path, string interactions = null, string processors = null,
            string groups = null)
        {
            throw HarnessStub.NotSupported();
        }

        public static BindingSyntax AddBinding(this InputAction action, InputControl control) { throw HarnessStub.NotSupported(); }

        public static BindingSyntax AddBinding(this InputAction action, InputBinding binding = default) { throw HarnessStub.NotSupported(); }

        public static CompositeSyntax AddCompositeBinding(this InputAction action, string composite, string interactions = null,
            string processors = null)
        {
            throw HarnessStub.NotSupported();
        }

        public static void AddControlScheme(this InputActionAsset asset, InputControlScheme controlScheme) { throw HarnessStub.NotSupported(); }

        public static ControlSchemeSyntax AddControlScheme(this InputActionAsset asset, string name) { throw HarnessStub.NotSupported(); }

        public struct BindingSyntax
        {
            public bool valid => throw HarnessStub.NotSupported();
            public BindingSyntax WithName(string name) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithPath(string path) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithGroup(string group) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithGroups(string groups) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithInteraction(string interaction) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithInteractions(string interactions) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithProcessor(string processor) { throw HarnessStub.NotSupported(); }
            public BindingSyntax WithProcessors(string processors) { throw HarnessStub.NotSupported(); }
        }

        public struct CompositeSyntax
        {
            public int bindingIndex => throw HarnessStub.NotSupported();
            public CompositeSyntax With(string name, string binding, string groups = null, string processors = null) { throw HarnessStub.NotSupported(); }
        }

        public struct ControlSchemeSyntax
        {
            public ControlSchemeSyntax WithBindingGroup(string bindingGroup) { throw HarnessStub.NotSupported(); }
            public ControlSchemeSyntax WithRequiredDevice<TDevice>() where TDevice : InputDevice { throw HarnessStub.NotSupported(); }
            public ControlSchemeSyntax WithOptionalDevice<TDevice>() where TDevice : InputDevice { throw HarnessStub.NotSupported(); }
            public ControlSchemeSyntax WithRequiredDevice(string controlPath) { throw HarnessStub.NotSupported(); }
            public ControlSchemeSyntax WithOptionalDevice(string controlPath) { throw HarnessStub.NotSupported(); }
            public InputControlScheme Done() { throw HarnessStub.NotSupported(); }
        }
    }
}
