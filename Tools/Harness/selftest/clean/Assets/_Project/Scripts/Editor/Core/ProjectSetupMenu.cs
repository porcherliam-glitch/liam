using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>Editor menu that applies the project settings from the architecture checklist.</summary>
    public static class ProjectSetupMenu
    {
        [MenuItem("Aetherfall/Setup/Projekteinstellungen anwenden")]
        private static void Apply()
        {
            EditorSettings.serializationMode = SerializationMode.ForceText;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.Standalone, string.Empty);
            AssetDatabase.SaveAssets();
        }
    }
}
