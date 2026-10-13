// HARNESS ONLY - stand-in for UnityEditor.Il2CppStacktraceInformation (Unity 2022.2+ / 6000.x).
// Values as in Unity 6000.3 (PlayerSettings.bindings.cs).
namespace UnityEditor
{
    /// <summary>Harness stand-in: amount of stack trace information in IL2CPP builds.</summary>
    public enum Il2CppStacktraceInformation
    {
        /// <summary>Method names only.</summary>
        MethodOnly = 0,
        /// <summary>Method names plus file and line numbers.</summary>
        MethodFileLineNumber = 1,
    }
}
