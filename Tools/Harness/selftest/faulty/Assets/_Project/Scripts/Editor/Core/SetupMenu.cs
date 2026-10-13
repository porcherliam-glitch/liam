using UnityEditor;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>SELF-TEST: uses a PlayerSettings overload that Unity 6.3 marks obsolete.</summary>
    public static class SetupMenu
    {
        [MenuItem("Aetherfall/Selbsttest")]
        private static void Apply()
        {
            PlayerSettings.SetScriptingDefineSymbolsForGroup(BuildTargetGroup.Standalone, "AETHERFALL_DEV");
        }
    }
}
