using System.IO;
using Aetherfall.EditorTools.Core;
using Aetherfall.UI.Screens;
using Aetherfall.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Menu <see cref="MenuPath"/> (German: "create Eichental"): reads and checks the layout file
    /// (<see cref="EichentalPaths.LayoutPath"/>, <see cref="RegionLayoutValidator"/>), prepares the shared assets like the test
    /// ground (<see cref="WorldSetup"/>) and builds the scene <see cref="EichentalPaths.ScenePath"/> from the layout
    /// (<see cref="EichentalSceneBuilder"/>). Afterwards the scene list is Boot → Eichental → test ground, and "Neues Spiel" in the
    /// main menu starts the Eichental (<see cref="UIInstaller"/>). Idempotent: running it again rebuilds the scene from the
    /// layout; terrain data, textures and materials are updated in place. <see cref="RunBatch"/> does the same without dialogs.
    /// Guide: docs/Anleitungen/11_Test_Eichental.md.
    /// </summary>
    public static class EichentalMenu
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Eichental erstellen";

        /// <summary>Menu: "Neues Spiel" starts in the Eichental.</summary>
        public const string StartEichentalPath = "Aetherfall/Neues Spiel startet in/Eichental";

        /// <summary>Menu: "Neues Spiel" starts in the test ground.</summary>
        public const string StartTestGroundPath = "Aetherfall/Neues Spiel startet in/Testgelände";

        private const string DialogTitle = "Eichental erstellen";
        private const string TestGroundTitle = "Testgelände";

        /// <summary>Runs the generator (asks first).</summary>
        [MenuItem(MenuPath, false, 19)]
        public static void Create()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorUtility.DisplayDialog(DialogTitle, "Bitte zuerst den Play-Modus beenden (Play-Knopf oben erneut drücken).", "OK");
                return;
            }

            bool sceneExists = File.Exists(FullPath(EichentalPaths.ScenePath));
            string question =
                "Aus der Layout-Datei\n" + EichentalPaths.LayoutPath + "\nwird das Dorf Eichental gebaut:\n\n" +
                "• Szene " + EichentalPaths.ScenePath + " mit Gelände (512 × 512 m, spielbar 400 × 400 m), Bächen, Brücken, " +
                "Häusern (intakt, verbrannt, eingestürzt), Bäumen, Feldern, Zäunen und dem Aether-Riss\n" +
                "• Spielfigur, Kamera, Wölfe, Truhen, Anschlagbrett, Orts-Zonen, NPC-Platzhalter, Quest-Objekte und Kräuter-Sammelpunkte\n" +
                "• Gelände-Daten, Texturen und Materialien in " + EichentalPaths.TerrainFolder + " und " + EichentalPaths.MaterialFolder + "\n" +
                "• Gemeinsame Daten wie beim Testgelände (Kampf, Items, Installer, Oberfläche)\n" +
                "• Szenenliste: Boot → Eichental → Testgelände; „Neues Spiel“ startet im Eichental\n\n" +
                (sceneExists
                    ? "Die Szene existiert bereits und wird NEU AUFGEBAUT. Eigene Änderungen in dieser Szene gehen verloren – " +
                      "dauerhafte Änderungen gehören in die Layout-Datei."
                    : "Das dauert etwa eine Minute.");
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
                message = "Das Eichental konnte nicht erstellt werden. Details stehen in der Console (Fenster > General > Console).";
            }
            else
            {
                Selection.activeGameObject = player;
                message = "Fertig! Die Szene „Eichental“ ist geöffnet.\n\nDrücke Play und klicke einmal ins Game-Fenster: Du wachst im " +
                          "brennenden Dorf auf. Mit Hauptmenü startest du über die Boot-Szene (Assets/_Project/Scenes/Boot/Boot.unity öffnen, " +
                          "dann Play, dann „Neues Spiel“).\n\nPrüfliste: docs/Anleitungen/11_Test_Eichental.md";
            }

            if (report.Warnings.Count > 0)
            {
                message += "\n\nHinweise (" + report.Warnings.Count + "):\n• " + string.Join("\n• ", report.Warnings);
            }

            EditorUtility.DisplayDialog(DialogTitle, message, "OK");
        }

        /// <summary>
        /// Batch mode entry point without dialogs (for Claude and CI): builds or rebuilds the Eichental, writes the protocol into
        /// the log and exits Unity with 0 (scene created) or 1 (error):
        /// <c>Unity -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.EichentalMenu.RunBatch -logFile Logs/eichental.log</c>.
        /// </summary>
        public static void RunBatch()
        {
            int exitCode = 1;
            try
            {
                var report = new TestGroundReport();
                GameObject player = Build(report);
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

        /// <summary>"Neues Spiel" starts in the Eichental.</summary>
        [MenuItem(StartEichentalPath, false, 40)]
        public static void StartInEichental()
        {
            var report = new TestGroundReport();
            SetStartScene(EichentalPaths.ScenePath, "Eichental", report);
            AssetDatabase.SaveAssets();
            report.LogToConsole();
        }

        [MenuItem(StartEichentalPath, true)]
        private static bool StartInEichentalValidate()
        {
            Menu.SetChecked(StartEichentalPath, CurrentStartScene() == EichentalPaths.ScenePath);
            return File.Exists(FullPath(EichentalPaths.ScenePath));
        }

        /// <summary>"Neues Spiel" starts in the test ground (debug).</summary>
        [MenuItem(StartTestGroundPath, false, 41)]
        public static void StartInTestGround()
        {
            var report = new TestGroundReport();
            SetStartScene(TestGroundPaths.ScenePath, TestGroundTitle, report);
            AssetDatabase.SaveAssets();
            report.LogToConsole();
        }

        [MenuItem(StartTestGroundPath, true)]
        private static bool StartInTestGroundValidate()
        {
            Menu.SetChecked(StartTestGroundPath, CurrentStartScene() == TestGroundPaths.ScenePath);
            return File.Exists(FullPath(TestGroundPaths.ScenePath));
        }

        /// <summary>Opens the Eichental scene.</summary>
        [MenuItem("Aetherfall/Szene öffnen/Eichental", false, 50)]
        public static void OpenEichental()
        {
            OpenScene(EichentalPaths.ScenePath);
        }

        /// <summary>Opens the test ground scene.</summary>
        [MenuItem("Aetherfall/Szene öffnen/Testgelände", false, 51)]
        public static void OpenTestGround()
        {
            OpenScene(TestGroundPaths.ScenePath);
        }

        /// <summary>Opens the boot scene (start with main menu).</summary>
        [MenuItem("Aetherfall/Szene öffnen/Boot (mit Hauptmenü)", false, 52)]
        public static void OpenBoot()
        {
            OpenScene(SetupPaths.BootScenePath);
        }

        private static GameObject Build(TestGroundReport report)
        {
            string layoutFile = FullPath(EichentalPaths.LayoutPath);
            if (!File.Exists(layoutFile))
            {
                report.Warning("Layout-Datei fehlt: " + EichentalPaths.LayoutPath);
                return null;
            }

            var check = new LayoutReport();
            RegionLayout layout = RegionLayoutValidator.ReadAndValidate(File.ReadAllText(layoutFile), check);
            foreach (LayoutIssue issue in check.Issues)
            {
                if (issue.Severity == LayoutIssueSeverity.Error)
                {
                    report.Warning("Layout-Fehler: " + issue);
                }
                else
                {
                    report.Info("Layout-Hinweis: " + issue);
                }
            }

            if (layout == null || check.HasErrors)
            {
                report.Warning("Die Layout-Datei hat " + check.ErrorCount + " Fehler – die Szene wird nicht gebaut. Bitte die Datei korrigieren " +
                               "(die Meldungen nennen Zeile und Feld) und das Menü erneut ausführen.");
                return null;
            }

            report.Info("Layout gelesen und geprüft: " + layout.LayoutId + " (Schema " + layout.SchemaVersion + ", " + check.WarningCount + " Hinweise).");
            if (!TestGroundAssets.EnsureFolder(EichentalPaths.SceneFolder, report) ||
                !TestGroundAssets.EnsureFolder(EichentalPaths.MaterialFolder, report) ||
                !TestGroundAssets.EnsureFolder(EichentalPaths.TerrainFolder, report) ||
                !TestGroundAssets.EnsureFolder(EichentalPaths.TerrainDataFolder, report) ||
                !TestGroundAssets.EnsureFolder(EichentalPaths.MeshFolder, report))
            {
                report.Warning("Ordner fehlen – Abbruch.");
                return null;
            }

            WorldSetup setup = WorldSetup.Prepare(report, false);
            if (setup == null)
            {
                return null;
            }

            if (!setup.IsComplete)
            {
                report.Warning("Kampf- oder Item-Daten unvollständig (siehe Meldungen oben) – das Eichental braucht beide. Abbruch.");
                return null;
            }

            GameObject player = EichentalSceneBuilder.Build(layout, setup.Settings, setup.Materials, setup.Layers, setup.Combat, setup.Items,
                setup.PlayerLevel, report);
            if (player == null)
            {
                return null;
            }

            SetStartScene(EichentalPaths.ScenePath, layout.SceneTitle.Length > 0 ? layout.SceneTitle : "Eichental", report);
            TestGroundUiBuilder.EnsureWorldSpace(layout.WorldSpaceId, EichentalPaths.ScenePath, layout.SceneTitle.Length > 0 ? layout.SceneTitle : "Eichental", report);
            TestGroundUiBuilder.EnsureSceneList(report);
            AssetDatabase.SaveAssets();
            return player;
        }

        private static void SetStartScene(string scenePath, string title, TestGroundReport report)
        {
            UIInstaller installer = AssetDatabase.LoadAssetAtPath<UIInstaller>(TestGroundUiBuilder.UIInstallerPath);
            if (installer == null)
            {
                report.Warning("UIInstaller fehlt (" + TestGroundUiBuilder.UIInstallerPath + "): „Neues Spiel“ kann nicht umgestellt werden. Bitte " +
                               "„" + TestGroundUiBuilder.MenuPath + "“ ausführen.");
                return;
            }

            TestGroundFields.SetString(installer, "gameplayScenePath", scenePath, report);
            TestGroundFields.SetString(installer, "gameplaySceneTitle", title, report);
            EditorUtility.SetDirty(installer);
            report.Info("„Neues Spiel“ und „Laden“ starten jetzt in: " + title + " (" + scenePath + ").");
        }

        private static string CurrentStartScene()
        {
            UIInstaller installer = AssetDatabase.LoadAssetAtPath<UIInstaller>(TestGroundUiBuilder.UIInstallerPath);
            return installer != null ? installer.GameplayScenePath : string.Empty;
        }

        private static void OpenScene(string path)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorUtility.DisplayDialog("Szene öffnen", "Bitte zuerst den Play-Modus beenden.", "OK");
                return;
            }

            if (!File.Exists(FullPath(path)))
            {
                EditorUtility.DisplayDialog("Szene öffnen", "Die Szene " + path + " gibt es noch nicht. Bitte zuerst das passende Menü " +
                                                            "„Aetherfall > … erstellen“ ausführen.", "OK");
                return;
            }

            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
            }
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
        }
    }
}
