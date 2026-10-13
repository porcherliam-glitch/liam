// HARNESS ONLY. NamedBuildTarget overloads of PlayerSettings (Unity 2021.2+), missing in
// the UnityEditor.dll (2021.1) reference. Signatures as in Unity 6000.3.
using UnityEditor;
using UnityEditor.Build;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEditor", "UnityEditor.PlayerSettings")]
    internal static class PlayerSettingsPatch
    {
        public static string GetScriptingDefineSymbols(NamedBuildTarget buildTarget) => throw null;

        public static void GetScriptingDefineSymbols(NamedBuildTarget buildTarget, out string[] defines) => throw null;

        public static void SetScriptingDefineSymbols(NamedBuildTarget buildTarget, string defines) => throw null;

        public static void SetScriptingDefineSymbols(NamedBuildTarget buildTarget, string[] defines) => throw null;

        public static string[] GetAdditionalCompilerArguments(NamedBuildTarget buildTarget) => throw null;

        public static void SetAdditionalCompilerArguments(NamedBuildTarget buildTarget, string[] additionalCompilerArguments) => throw null;

        public static int GetArchitecture(NamedBuildTarget buildTarget) => throw null;

        public static void SetArchitecture(NamedBuildTarget buildTarget, int architecture) => throw null;

        public static ScriptingImplementation GetScriptingBackend(NamedBuildTarget buildTarget) => throw null;

        public static void SetScriptingBackend(NamedBuildTarget buildTarget, ScriptingImplementation backend) => throw null;

        public static ScriptingImplementation GetDefaultScriptingBackend(NamedBuildTarget buildTarget) => throw null;

        public static string GetApplicationIdentifier(NamedBuildTarget buildTarget) => throw null;

        public static void SetApplicationIdentifier(NamedBuildTarget buildTarget, string identifier) => throw null;

        public static Il2CppCompilerConfiguration GetIl2CppCompilerConfiguration(NamedBuildTarget buildTarget) => throw null;

        public static void SetIl2CppCompilerConfiguration(NamedBuildTarget buildTarget, Il2CppCompilerConfiguration configuration) => throw null;

        public static Il2CppStacktraceInformation GetIl2CppStacktraceInformation(NamedBuildTarget buildTarget) => throw null;

        public static void SetIl2CppStacktraceInformation(NamedBuildTarget buildTarget, Il2CppStacktraceInformation option) => throw null;

        public static Il2CppCodeGeneration GetIl2CppCodeGeneration(NamedBuildTarget buildTarget) => throw null;

        public static void SetIl2CppCodeGeneration(NamedBuildTarget buildTarget, Il2CppCodeGeneration value) => throw null;

        public static ManagedStrippingLevel GetManagedStrippingLevel(NamedBuildTarget buildTarget) => throw null;

        public static void SetManagedStrippingLevel(NamedBuildTarget buildTarget, ManagedStrippingLevel level) => throw null;

        public static ApiCompatibilityLevel GetApiCompatibilityLevel(NamedBuildTarget buildTarget) => throw null;

        public static void SetApiCompatibilityLevel(NamedBuildTarget buildTarget, ApiCompatibilityLevel value) => throw null;

        public static NormalMapEncoding GetNormalMapEncoding(NamedBuildTarget buildTarget) => throw null;

        public static void SetNormalMapEncoding(NamedBuildTarget buildTarget, NormalMapEncoding encoding) => throw null;
    }
}
