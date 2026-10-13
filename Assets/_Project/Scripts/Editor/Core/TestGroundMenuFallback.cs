#if !AETHERFALL_INPUTSYSTEM || !AETHERFALL_CINEMACHINE
using UnityEditor;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Stand-in for the menu "Aetherfall > Testgelaende erstellen" while the Input System or Cinemachine 3 package is
    /// missing: the real menu lives in Aetherfall.EditorTools.World, which is only compiled with both packages (define
    /// constraints). Explains what to do and opens the project setup window. Compiled only while a package is missing
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
