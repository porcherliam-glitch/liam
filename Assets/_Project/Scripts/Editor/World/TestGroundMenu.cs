using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Menu <see cref="MenuPath"/> (German: "create test ground"): creates or rebuilds the test ground scene with player
    /// (movement, stats, health, save and combat components), camera rig with lock-on camera, obstacle course, combat arena
    /// (training dummy, wolves), chests and debug overlays, the materials, the player movement settings, the combat data
    /// (attacks, weapon, shield, enemy types, combat settings), the item data (items, affixes, loot tables, starting
    /// equipment, content catalog; <see cref="TestGroundItemAssets"/>), the user layers
    /// Player/Enemy/Hurtbox/Interactable/Environment/Pickup and the Input, Save, GameTime, Content, Inventory, Combat and AI
    /// installers in the BootConfig, the quest part (Conditions, WorldState, Progression and Quest installers, the two test
    /// quests with their flags, checked by the quest validator, notice board and training ground zone;
    /// <see cref="TestGroundQuestAssets"/>, <see cref="TestGroundQuestBuilder"/>) and the user interface
    /// (<see cref="TestGroundUiBuilder"/>: SceneLoader and UI installers, panel settings, UI object in the boot scene, scene list
    /// Boot + Eichental + test ground; shared part in <see cref="WorldSetup"/>). Idempotent: existing assets are reused, an existing scene is
    /// rebuilt only after asking.
    /// <see cref="RunBatch"/> does the same without dialogs (batch mode, CLAUDE.md "Batchmode-Einstiegspunkte").
    /// Guides: docs/Anleitungen/03_Test_Spielfigur.md, 04_Test_Werte_Speichern.md, 05_Test_Kampf.md, 06_Test_Items_Loot.md,
    /// 07_Test_Oberflaeche.md, 09_Test_Quests_im_Spiel.md.
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
                "• Kampf: Angriffe, Waffe, Schild, Gegnertypen (" + TestGroundPaths.AttackFolder + ", " + TestGroundPaths.EnemyFolder + "), " +
                TestGroundPaths.CombatSettingsPath + ", CombatInstaller und AIInstaller in der BootConfig\n" +
                "• Arena mit Trainingspuppe, 2 Wölfen und 1 Aether-Wolf\n" +
                "• Items, Affixe, Loot-Tabellen und Startausrüstung (" + TestGroundPaths.ItemFolder + ", " + TestGroundPaths.LootTableFolder +
                "), " + TestGroundPaths.ContentCatalogPath + ", ContentInstaller und InventoryInstaller in der BootConfig\n" +
                "• 3 Truhen (Holz, Eisen, versteckt) und Beute-Anzeige\n" +
                "• Quests: Conditions-, WorldState-, Progression- und QuestInstaller in der BootConfig (Startstufe neues Spiel " +
                Aetherfall.EditorTools.Narrative.TestGroundLevels.PlayerStartLevel + ", nur zum Testen), 2 Test-Quests mit Flags (" +
                TestGroundPaths.QuestFolder + ", " + TestGroundPaths.FlagFolder + "), Anschlagtafel und Übungsplatz, Wölfe kehren nach " +
                TestGroundPaths.ArenaRespawnSeconds + " s zurück\n" +
                "• Layer 6 „Player“, 7 „Enemy“, 9 „Hurtbox“, 10 „Interactable“, 11 „Environment“, 14 „TriggerVolume“ und 16 „Pickup“, falls frei\n" +
                "• Oberfläche: SceneLoaderInstaller und UIInstaller in der BootConfig, " + TestGroundUiBuilder.PanelSettingsPath +
                ", Objekt „UI“ in der Boot-Szene (Hauptmenü, HUD mit Quest-Verfolgung, Pausemenü, Questlog & Charakter, Todesbildschirm, " +
                "Ladebildschirm, Menükamera), Szenenliste Boot + Eichental (falls erstellt) + Testgelände\n\n" +
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
                message = "Fertig! Die Szene „Testgelaende“ ist geöffnet.\n\nDrücke jetzt Play und klicke einmal ins Game-Fenster: " +
                          "Das Spiel startet direkt im Testgelände. Mit Hauptmenü startest du über die Boot-Szene " +
                          "(Assets/_Project/Scenes/Boot/Boot.unity öffnen, dann Play).\n\n" +
                          "Steuerung und Prüfliste: docs/Anleitungen/03_Test_Spielfigur.md, Ausdauer, Schaden und Speichern: " +
                          "docs/Anleitungen/04_Test_Werte_Speichern.md, Kampf: docs/Anleitungen/05_Test_Kampf.md, Items und Beute: " +
                          "docs/Anleitungen/06_Test_Items_Loot.md, Oberfläche: docs/Anleitungen/07_Test_Oberflaeche.md, Quests: " +
                          "docs/Anleitungen/09_Test_Quests_im_Spiel.md.";
            }

            if (report.Warnings.Count > 0)
            {
                message += "\n\nHinweise (" + report.Warnings.Count + "):\n• " + string.Join("\n• ", report.Warnings);
            }

            EditorUtility.DisplayDialog(DialogTitle, message, "OK");
        }

        /// <summary>
        /// Batch mode entry point without dialogs (for Claude and CI): builds or rebuilds everything, writes the protocol into
        /// the log and exits Unity with 0 (scene created) or 1 (error):
        /// <c>Unity -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.TestGroundMenu.RunBatch -logFile Logs/testgelaende.log</c>.
        /// An existing test ground scene is rebuilt without asking.
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

        private static GameObject Build(TestGroundReport report)
        {
            WorldSetup setup = WorldSetup.Prepare(report, true);
            if (setup == null)
            {
                return null;
            }

            WorldLayers layers = setup.Layers;
            GameObject player = TestGroundSceneBuilder.Build(setup.Settings, setup.Materials, layers.Player, layers.Environment, setup.Combat, layers.Enemy,
                layers.Hurtbox, setup.Items, layers.Interactable, layers.Pickup, layers.TriggerVolume, report);
            TestGroundUiBuilder.EnsureSceneList(report);
            TestGroundUiBuilder.EnsureWorldSpace(TestGroundPaths.WorldSpaceId, TestGroundPaths.ScenePath, "Testgelände", report);
            AssetDatabase.SaveAssets();
            return player;
        }
    }
}
