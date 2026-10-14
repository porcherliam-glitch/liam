using Aetherfall.EditorTools.Core;
using Aetherfall.Player;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Everything a generated world scene needs before its scene is built, shared by "Aetherfall > Testgelände erstellen"
    /// (<see cref="TestGroundMenu"/>) and "Aetherfall > Eichental erstellen" (<see cref="EichentalMenu"/>): folders, the user
    /// layers (architecture 2.8), materials of player and enemies, player movement settings, combat, item and quest data, all
    /// installers in the BootConfig and the user interface in the boot scene. Idempotent: existing assets are reused.
    /// </summary>
    public sealed class WorldSetup
    {
        private WorldSetup(WorldLayers layers, PlayerMovementSettings settings, TestGroundMaterials materials, TestGroundCombatAssets combat,
            TestGroundItemAssets items)
        {
            Layers = layers;
            Settings = settings;
            Materials = materials;
            Combat = combat;
            Items = items;
        }

        /// <summary>Layer indices.</summary>
        public WorldLayers Layers { get; }

        /// <summary>Movement settings of the player.</summary>
        public PlayerMovementSettings Settings { get; }

        /// <summary>Materials of player, weapons and enemies (and of the test ground geometry).</summary>
        public TestGroundMaterials Materials { get; }

        /// <summary>Combat data (attacks, weapon, shield, enemy types, settings).</summary>
        public TestGroundCombatAssets Combat { get; }

        /// <summary>Item data (items, affixes, loot tables, starting equipment, catalog, chest materials).</summary>
        public TestGroundItemAssets Items { get; }

        /// <summary>True if combat and item data are complete.</summary>
        public bool IsComplete => Combat != null && Combat.IsComplete && Items != null && Items.IsComplete;

        /// <summary>Creates or completes all shared assets and the boot scene UI (the boot scene is left open).</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The setup, or null if folders or the movement settings are missing.</returns>
        public static WorldSetup Prepare(TestGroundReport report)
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

            WorldLayers layers = EnsureLayers(report);
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
            // replaces it by the new world scene.
            PanelSettings panel = TestGroundUiBuilder.EnsurePanelSettings(report);
            if (panel == null || !TestGroundUiBuilder.EnsureBootUi(panel, report))
            {
                report.Warning("Die Oberfläche in der Boot-Szene ist unvollständig (siehe Meldungen oben). Die Szene funktioniert " +
                               "trotzdem, Hauptmenü und HUD fehlen aber. Danach „" + TestGroundUiBuilder.MenuPath + "“ ausführen.");
            }

            return new WorldSetup(layers, settings, materials, combat, items);
        }

        private static WorldLayers EnsureLayers(TestGroundReport report)
        {
            var layers = new WorldLayers
            {
                Player = ProjectLayers.Ensure(TestGroundPaths.PlayerLayerIndex, TestGroundPaths.PlayerLayerName, report),
                Environment = ProjectLayers.Ensure(TestGroundPaths.EnvironmentLayerIndex, TestGroundPaths.EnvironmentLayerName, report),
                Enemy = ProjectLayers.Ensure(TestGroundPaths.EnemyLayerIndex, TestGroundPaths.EnemyLayerName, report),
                Hurtbox = ProjectLayers.Ensure(TestGroundPaths.HurtboxLayerIndex, TestGroundPaths.HurtboxLayerName, report),
                Terrain = ProjectLayers.Ensure(EichentalPaths.TerrainLayerIndex, EichentalPaths.TerrainLayerName, report)
            };
            if (layers.Hurtbox >= 0)
            {
                ProjectLayers.IsolateLayer(layers.Hurtbox, report);
            }

            layers.Interactable = ProjectLayers.Ensure(TestGroundPaths.InteractableLayerIndex, TestGroundPaths.InteractableLayerName, report);
            if (layers.Interactable >= 0)
            {
                ProjectLayers.IsolateLayer(layers.Interactable, report);
            }

            layers.Pickup = ProjectLayers.Ensure(TestGroundPaths.PickupLayerIndex, TestGroundPaths.PickupLayerName, report);
            if (layers.Pickup >= 0)
            {
                // Architecture 2.8: Pickup collides with Environment, Terrain and Player only (the loot collector uses queries).
                ProjectLayers.RestrictLayer(layers.Pickup, new[] { layers.Environment, layers.Terrain, layers.Player }, report);
            }

            layers.TriggerVolume = ProjectLayers.Ensure(TestGroundPaths.TriggerVolumeLayerIndex, TestGroundPaths.TriggerVolumeLayerName, report);
            if (layers.TriggerVolume >= 0)
            {
                // Architecture 2.8: TriggerVolume collides with Player and NPC only (NPC follows with the NPC step).
                ProjectLayers.RestrictLayer(layers.TriggerVolume, new[] { layers.Player }, report);
            }

            int water = LayerMask.NameToLayer("Water");
            layers.Water = water >= 0 ? water : 0;
            return layers;
        }
    }
}
