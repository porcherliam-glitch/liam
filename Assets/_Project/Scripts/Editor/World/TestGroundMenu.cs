using System.IO;
using Aetherfall.EditorTools.Core;
using Aetherfall.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Menu <see cref="MenuPath"/> (German: "create test ground"): creates or rebuilds the test ground scene with player
    /// (movement, stats, health, save components), camera rig, obstacle course and debug overlays, the materials, the player
    /// movement settings, the user layers Player/Environment and the Input, Save and GameTime installers in the BootConfig.
    /// Idempotent: existing assets are reused, an existing scene is rebuilt only after asking. Guides:
    /// docs/Anleitungen/03_Test_Spielfigur.md and 04_Test_Werte_Speichern.md.
    /// </summary>
    public static class TestGroundMenu
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Testgelände erstellen";

        private const string DialogTitle = "Testgelände erstellen";

        /// <summary>Runs the builder (asks first).</summary>
        [MenuItem(MenuPath, false, 20)]
        public static void Create()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorUtility.DisplayDialog(DialogTitle, "Bitte zuerst den Play-Modus beenden (Play-Knopf oben erneut drücken).", "OK");
                return;
            }

            bool sceneExists = File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, TestGroundPaths.ScenePath));
            string question =
                "Angelegt bzw. ergänzt werden:\n\n" +
                "• Szene " + TestGroundPaths.ScenePath + " mit Spielfigur, Kamera und Hindernisparcours\n" +
                "• Materialien in " + TestGroundPaths.MaterialFolder + "\n" +
                "• " + TestGroundPaths.MovementSettingsPath + "\n" +
                "• InputInstaller in der BootConfig (hinter dem GameState-Installer)\n" +
                "• SaveInstaller und GameTimeInstaller in der BootConfig (hinter dem Input-Installer)\n" +
                "• Layer 6 „Player“ und 11 „Environment“, falls frei\n\n" +
                (sceneExists
                    ? "Die Szene existiert bereits und wird NEU AUFGEBAUT. Eigene Änderungen in dieser Szene gehen verloren. " +
                      "Die Assets (Materialien, Einstellungen) bleiben erhalten."
                    : "Vorhandene Assets werden nicht überschrieben.");
            if (!EditorUtility.DisplayDialog(DialogTitle, question, sceneExists ? "Neu aufbauen" : "Erstellen", "Abbrechen"))
            {
                return;
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return;
            }

            var report = new TestGroundReport();
            GameObject player = Build(report);
            report.LogToConsole();

            string message;
            if (player == null)
            {
                message = "Das Testgelände konnte nicht vollständig erstellt werden. Details stehen in der Console.";
            }
            else
            {
                Selection.activeGameObject = player;
                message = "Fertig! Die Szene „Testgelaende“ ist geöffnet.\n\nDrücke jetzt Play und klicke einmal ins Game-Fenster. " +
                          "Steuerung und Prüfliste: docs/Anleitungen/03_Test_Spielfigur.md, Ausdauer, Schaden und Speichern: " +
                          "docs/Anleitungen/04_Test_Werte_Speichern.md.";
            }

            if (report.Warnings.Count > 0)
            {
                message += "\n\nHinweise (" + report.Warnings.Count + "):\n• " + string.Join("\n• ", report.Warnings);
            }

            EditorUtility.DisplayDialog(DialogTitle, message, "OK");
        }

        private static GameObject Build(TestGroundReport report)
        {
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.SceneFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.MaterialFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.PlayerSettingsFolder, report) ||
                !TestGroundAssets.EnsureFolder(SetupPaths.BootSettingsFolder, report))
            {
                report.Warning("Ordner fehlen – Abbruch.");
                return null;
            }

            int playerLayer = ProjectLayers.Ensure(TestGroundPaths.PlayerLayerIndex, TestGroundPaths.PlayerLayerName, report);
            int environmentLayer = ProjectLayers.Ensure(TestGroundPaths.EnvironmentLayerIndex, TestGroundPaths.EnvironmentLayerName, report);

            var materials = new TestGroundMaterials(report);
            PlayerMovementSettings settings = TestGroundAssets.EnsureMovementSettings(report);
            TestGroundAssets.EnsureInputInstallerInBootConfig(report);
            TestGroundAssets.EnsureSaveInstallersInBootConfig(report);
            AssetDatabase.SaveAssets();

            if (settings == null)
            {
                report.Warning("Ohne PlayerMovementSettings kann sich die Figur nicht bewegen – Szene nicht erstellt.");
                return null;
            }

            GameObject player = TestGroundSceneBuilder.Build(settings, materials, playerLayer, environmentLayer, report);
            AssetDatabase.SaveAssets();
            return player;
        }
    }
}
