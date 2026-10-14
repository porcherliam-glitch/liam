using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Menu <see cref="MenuPath"/> (German: "create the crypt"): builds or rebuilds the dungeon "Die vergessene Gruft" (GDD 02
    /// 11.7) as scene <see cref="GruftPaths.ScenePath"/> from <see cref="GruftPaths.LayoutPath"/> (<see cref="GruftSceneBuilder"/>).
    /// Idempotent: existing assets are reused, the scene is rebuilt after asking. <see cref="RunBatch"/> does the same without
    /// dialogs (batch mode, CLAUDE.md "Batchmode-Einstiegspunkte"). Guide: docs/Anleitungen/12_Test_Gruft.md.
    /// </summary>
    public static class GruftMenu
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Gruft erstellen";

        private const string DialogTitle = "Gruft erstellen";

        /// <summary>Runs the builder (asks first).</summary>
        [MenuItem(MenuPath, false, 22)]
        public static void Create()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorUtility.DisplayDialog(DialogTitle, "Bitte zuerst den Play-Modus beenden (Play-Knopf oben erneut drücken).", "OK");
                return;
            }

            bool sceneExists = File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, GruftPaths.ScenePath));
            string question =
                "Aus " + GruftPaths.LayoutPath + " wird die Szene " + GruftPaths.ScenePath + " gebaut:\n\n" +
                "• 7 Räume und 8 Gänge aus einfachen Formen, dunkles Licht mit Fackeln und Aether-Leuchten\n" +
                "• Rätsel Grabplatten (Pfeilfalle) und Spiegel mit Lichtstrahl, Hebel, Druckplatte, Türen\n" +
                "• 6 Skelett-Krieger (1 Elite mit Turmschild) und der Mini-Boss „Der Wachende Ritter“\n" +
                "• Truhen, Inschriften, Grabräuber im Käfig, Siegelstein und Klingenfragment, 2 Ausgänge\n" +
                "• Gegner-, Boss- und Angriffsdaten, Loot-Tabellen, Questgegenstände\n" +
                "• Installer Weltobjekte, Weltobjekte speichern und Bosse in der BootConfig\n" +
                "• Daten der Spielfigur wie im Testgelände (werden nur angelegt, wenn sie fehlen)\n\n" +
                (sceneExists
                    ? "Die Szene existiert bereits und wird NEU AUFGEBAUT. Eigene Änderungen in dieser Szene gehen verloren."
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
            GameObject player = GruftSceneBuilder.Build(report);
            report.LogToConsole();
            string message;
            if (player == null)
            {
                message = "Die Gruft konnte nicht vollständig erstellt werden. Details stehen in der Console.";
            }
            else
            {
                Selection.activeGameObject = player;
                message = "Fertig! Die Szene „Gruft“ ist geöffnet.\n\nDrücke Play und klicke einmal ins Game-Fenster: Du stehst im Vorraum " +
                          "vor dem versiegelten Tor. Prüfliste: docs/Anleitungen/12_Test_Gruft.md.";
            }

            if (report.Warnings.Count > 0)
            {
                message += "\n\nHinweise (" + report.Warnings.Count + "):\n• " + string.Join("\n• ", report.Warnings);
            }

            EditorUtility.DisplayDialog(DialogTitle, message, "OK");
        }

        /// <summary>
        /// Batch mode entry point without dialogs: builds or rebuilds everything, writes the protocol into the log and exits Unity
        /// with 0 (scene created) or 1 (error):
        /// <c>Unity -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.GruftMenu.RunBatch -logFile Logs/gruft.log</c>.
        /// </summary>
        public static void RunBatch()
        {
            int exitCode = 1;
            try
            {
                var report = new TestGroundReport();
                GameObject player = GruftSceneBuilder.Build(report);
                report.LogToConsole();
                exitCode = player != null ? 0 : 1;
            }
            catch (System.Exception exception)
            {
                Debug.LogException(exception);
            }

            if (Application.isBatchMode)
            {
                EditorApplication.Exit(exitCode);
            }
        }
    }
}
