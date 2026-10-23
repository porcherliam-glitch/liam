#if !AETHERFALL_INPUTSYSTEM || !AETHERFALL_CINEMACHINE || !AETHERFALL_NEWTONSOFT || !AETHERFALL_TIMELINE
using UnityEditor;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Stand-in for the menu "Aetherfall > Testgelaende erstellen" while the Input System, Cinemachine 3, Timeline or Newtonsoft
    /// JSON package is missing: the real menu lives in Aetherfall.EditorTools.World, which is only compiled with all four
    /// packages (define constraints). Explains what to do and opens the project setup window. Compiled only while a package is missing
    /// (version defines of this assembly), so the two menu items never exist at the same time.
    /// </summary>
    internal static class TestGroundMenuFallback
    {
        private const string MenuPath = "Aetherfall/Testgelände erstellen";

        [MenuItem(MenuPath, false, 20)]
        private static void Explain()
        {
            string missing = string.Empty;
#if !AETHERFALL_INPUTSYSTEM
            missing += "• Input System (com.unity.inputsystem)\n";
#endif
#if !AETHERFALL_CINEMACHINE
            missing += "• Cinemachine 3 (com.unity.cinemachine)\n";
#endif
#if !AETHERFALL_NEWTONSOFT
            missing += "• Newtonsoft JSON (com.unity.nuget.newtonsoft-json) für das Speichersystem\n";
#endif
#if !AETHERFALL_TIMELINE
            missing += "• Timeline (com.unity.timeline) für die Zwischensequenzen\n";
#endif
            bool open = EditorUtility.DisplayDialog(
                "Testgelände erstellen",
                "Für das Testgelände fehlen noch Pakete:\n\n" + missing +
                "\nÖffne „Aetherfall > Projekt-Setup …“ und klicke „Alles ausführen“. Danach lädt Unity neu, und dieser Menüpunkt " +
                "erstellt das Testgelände.",
                "Projekt-Setup öffnen",
                "Schließen");
            if (open)
            {
                ProjectSetupWindow.Open();
            }
        }
    }
}
#endif
