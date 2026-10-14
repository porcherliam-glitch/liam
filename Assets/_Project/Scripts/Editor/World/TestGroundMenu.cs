using System.IO;
using Aetherfall.EditorTools.Core;
using Aetherfall.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;

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
    /// Boot + test ground). Idempotent: existing assets are reused, an existing scene is rebuilt only after asking.
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
                "• Quests: Conditions-, WorldState-, Progression- und QuestInstaller in der BootConfig, 2 Test-Quests mit Flags (" +
                TestGroundPaths.QuestFolder + ", " + TestGroundPaths.FlagFolder + "), Anschlagtafel und Übungsplatz, Wölfe kehren nach " +
                TestGroundPaths.ArenaRespawnSeconds + " s zurück\n" +
                "• Layer 6 „Player“, 7 „Enemy“, 9 „Hurtbox“, 10 „Interactable“, 11 „Environment“, 14 „TriggerVolume“ und 16 „Pickup“, falls frei\n" +
                "• Oberfläche: SceneLoaderInstaller und UIInstaller in der BootConfig, " + TestGroundUiBuilder.PanelSettingsPath +
                ", Objekt „UI“ in der Boot-Szene (Hauptmenü, HUD, Pausemenü, Todesbildschirm, Ladebildschirm, Menükamera), Szenenliste Boot + Testgelände\n\n" +
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
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.SceneFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.MaterialFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.PlayerSettingsFolder, report) ||
                !TestGroundAssets.EnsureFolder(SetupPaths.BootSettingsFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.AttackFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.WeaponFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.EnemyFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.CombatSettingsFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.ItemFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.LootTableFolder, report) ||
                !TestGroundAssets.EnsureFolder(TestGroundPaths.ItemSettingsFolder, report))
            {
                report.Warning("Ordner fehlen – Abbruch.");
                return null;
            }

            int playerLayer = ProjectLayers.Ensure(TestGroundPaths.PlayerLayerIndex, TestGroundPaths.PlayerLayerName, report);
            int environmentLayer = ProjectLayers.Ensure(TestGroundPaths.EnvironmentLayerIndex, TestGroundPaths.EnvironmentLayerName, report);
            int enemyLayer = ProjectLayers.Ensure(TestGroundPaths.EnemyLayerIndex, TestGroundPaths.EnemyLayerName, report);
            int hurtboxLayer = ProjectLayers.Ensure(TestGroundPaths.HurtboxLayerIndex, TestGroundPaths.HurtboxLayerName, report);
            if (hurtboxLayer >= 0)
            {
                ProjectLayers.IsolateLayer(hurtboxLayer, report);
            }

            int interactableLayer = ProjectLayers.Ensure(TestGroundPaths.InteractableLayerIndex, TestGroundPaths.InteractableLayerName, report);
            if (interactableLayer >= 0)
            {
                ProjectLayers.IsolateLayer(interactableLayer, report);
            }

            int pickupLayer = ProjectLayers.Ensure(TestGroundPaths.PickupLayerIndex, TestGroundPaths.PickupLayerName, report);
            if (pickupLayer >= 0)
            {
                // Architecture 2.8: Pickup collides with Environment, Terrain and Player only (the loot collector uses queries).
                ProjectLayers.RestrictLayer(pickupLayer, new[] { environmentLayer, LayerMask.NameToLayer("Terrain"), playerLayer }, report);
            }

            int triggerVolumeLayer = ProjectLayers.Ensure(TestGroundPaths.TriggerVolumeLayerIndex, TestGroundPaths.TriggerVolumeLayerName, report);
            if (triggerVolumeLayer >= 0)
            {
                // Architecture 2.8: TriggerVolume collides with Player and NPC only (NPC follows with the NPC step).
                ProjectLayers.RestrictLayer(triggerVolumeLayer, new[] { playerLayer }, report);
            }

            var materials = new TestGroundMaterials(report);
            PlayerMovementSettings settings = TestGroundAssets.EnsureMovementSettings(report);
            TestGroundAssets.EnsureInputInstallerInBootConfig(report);
            TestGroundAssets.EnsureSaveInstallersInBootConfig(report);
            var combat = new TestGroundCombatAssets(report);
            TestGroundAssets.EnsureCombatInstallersInBootConfig(combat.Settings, report);
            var items = new TestGroundItemAssets(report);
            items.AssignWolfLoot(combat.Wolf, combat.AetherWolf);
            TestGroundAssets.EnsureItemInstallersInBootConfig(items.Catalog, items.StartingEquipment, report);
            TestGroundAssets.EnsureNarrativeInstallersInBootConfig(report);
            var quests = new TestGroundQuestAssets(items.Catalog, report);
            TestGroundUiBuilder.EnsureInstallers(report);
            AssetDatabase.SaveAssets();
            if (quests.Count > 0 && !quests.Validate())
            {
                report.Warning("Die Quest-Prüfung meldet Fehler (siehe Meldungen oben). Details: „Aetherfall > Quests prüfen“.");
            }

            if (settings == null)
            {
                report.Warning("Ohne PlayerMovementSettings kann sich die Figur nicht bewegen – Szene nicht erstellt.");
                return null;
            }

            // The boot scene part (UI object, panel settings) first: it opens and saves the boot scene, the scene builder then
            // replaces it by the new test ground.
            PanelSettings panel = TestGroundUiBuilder.EnsurePanelSettings(report);
            if (panel == null || !TestGroundUiBuilder.EnsureBootUi(panel, report))
            {
                report.Warning("Die Oberfläche in der Boot-Szene ist unvollständig (siehe Meldungen oben). Das Testgelände funktioniert " +
                               "trotzdem, Hauptmenü und HUD fehlen aber. Danach „" + TestGroundUiBuilder.MenuPath + "“ ausführen.");
            }

            GameObject player = TestGroundSceneBuilder.Build(settings, materials, playerLayer, environmentLayer, combat, enemyLayer, hurtboxLayer, items,
                interactableLayer, pickupLayer, triggerVolumeLayer, report);
            TestGroundUiBuilder.EnsureSceneList(report);
            AssetDatabase.SaveAssets();
            return player;
        }
    }
}
