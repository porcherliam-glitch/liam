// HARNESS ONLY - stub of UnityEngine.InputSystem.Layouts.InputDeviceDescription (com.unity.inputsystem 1.x).
namespace UnityEngine.InputSystem.Layouts
{
    public struct InputDeviceDescription
    {
        public string interfaceName { get; set; }
        public string deviceClass { get; set; }
        public string manufacturer { get; set; }
        public string product { get; set; }
        public string serial { get; set; }
        public string version { get; set; }
        public string capabilities { get; set; }
        public bool empty => throw HarnessStub.NotSupported();
    }
}
