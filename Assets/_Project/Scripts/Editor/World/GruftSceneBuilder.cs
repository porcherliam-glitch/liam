using System;
using System.Collections.Generic;
using System.IO;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.EditorTools.Core;
using Aetherfall.Player;
using Aetherfall.World.Dungeons;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the scene <see cref="GruftPaths.ScenePath"/> from the layout file (single source with the Blender preview): reads and
    /// validates the layout, makes sure the data of the test ground (player, combat, items, quests, UI installers) and of the
    /// crypt (<see cref="GruftAssets"/>, <see cref="GruftInstallers"/>) exist, creates the dark atmosphere (flat ambient light,
    /// fog, no sun), the shell (<see cref="GruftGeometryBuilder"/>), the player (<see cref="GruftPlayerBuilder"/>), the objects,
    /// doors, puzzles, traps and lights (<see cref="GruftObjectBuilder"/>), the enemies and the boss
    /// (<see cref="GruftEnemyBuilder"/>), the overlays, saves the scene and adds it to the scene list.
    /// </summary>
    public static class GruftSceneBuilder
    {
        /// <summary>Builds everything.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The player object, or null on failure.</returns>
        public static GameObject Build(TestGroundReport report)
        {
            DungeonLayout layout = LoadLayout(report);
            if (layout == null)
            {
                return null;
            }

            if (!EnsureFolders(report))
            {
                report.Warning("Ordner fehlen – Abbruch.");
                return null;
            }

            int playerLayer = ProjectLayers.Ensure(TestGroundPaths.PlayerLayerIndex, TestGroundPaths.PlayerLayerName, report);
            int environmentLayer = ProjectLayers.Ensure(TestGroundPaths.EnvironmentLayerIndex, TestGroundPaths.EnvironmentLayerName, report);
            int enemyLayer = ProjectLayers.Ensure(TestGroundPaths.EnemyLayerIndex, TestGroundPaths.EnemyLayerName, report);
            int hurtboxLayer = ProjectLayers.Ensure(TestGroundPaths.HurtboxLayerIndex, TestGroundPaths.HurtboxLayerName, report);
            int interactableLayer = ProjectLayers.Ensure(TestGroundPaths.InteractableLayerIndex, TestGroundPaths.InteractableLayerName, report);
            int pickupLayer = ProjectLayers.Ensure(TestGroundPaths.PickupLayerIndex, TestGroundPaths.PickupLayerName, report);
            int triggerLayer = ProjectLayers.Ensure(TestGroundPaths.TriggerVolumeLayerIndex, TestGroundPaths.TriggerVolumeLayerName, report);
            if (environmentLayer < 0)
            {
                environmentLayer = 0;
            }

            // Same collision rules as the test ground (architecture 2.8).
            if (hurtboxLayer >= 0)
            {
                ProjectLayers.IsolateLayer(hurtboxLayer, report);
            }

            if (interactableLayer >= 0)
            {
                ProjectLayers.IsolateLayer(interactableLayer, report);
            }

            if (pickupLayer >= 0)
            {
                ProjectLayers.RestrictLayer(pickupLayer, new[] { environmentLayer, LayerMask.NameToLayer("Terrain"), playerLayer }, report);
            }

            if (triggerLayer >= 0)
            {
                ProjectLayers.RestrictLayer(triggerLayer, new[] { playerLayer }, report);
            }

            var testMaterials = new TestGroundMaterials(report);
            PlayerMovementSettings settings = TestGroundAssets.EnsureMovementSettings(report);
            TestGroundAssets.EnsureInputInstallerInBootConfig(report);
            TestGroundAssets.EnsureSaveInstallersInBootConfig(report);
            var combat = new TestGroundCombatAssets(report);
            TestGroundAssets.EnsureCombatInstallersInBootConfig(combat.Settings, report);
            var items = new TestGroundItemAssets(report);
            TestGroundAssets.EnsureItemInstallersInBootConfig(items.Catalog, items.StartingEquipment, report);
            TestGroundAssets.EnsureDialogueInstallersInBootConfig(report);
            TestGroundAssets.EnsureNarrativeInstallersInBootConfig(report, setTestStartLevel: false);
            TestGroundUiBuilder.EnsureInstallers(report);
            var assets = new GruftAssets(report);
            GruftInstallers.EnsureAll(report);
            AssetDatabase.SaveAssets();
            if (settings == null || !combat.IsComplete || !items.IsComplete || !assets.IsComplete)
            {
                report.Warning("Spielfigur-, Kampf-, Item- oder Gegnerdaten fehlen (siehe Meldungen oben) – Szene nicht erstellt.");
                return null;
            }

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            RemoveSun(scene);
            var materials = new GruftMaterials(layout.Atmosphere, report);
            DungeonGeometry geometry = DungeonGeometry.Build(layout);
            var ctx = new GruftContext(layout, geometry, materials, report)
            {
                PlayerLayer = playerLayer,
                EnvironmentLayer = environmentLayer,
                EnemyLayer = enemyLayer,
                HurtboxLayer = hurtboxLayer,
                InteractableLayer = interactableLayer,
                TriggerVolumeLayer = triggerLayer,
                PickupLayer = pickupLayer,
                Font = LoadFont(report)
            };

            SetUpAtmosphere(layout.Atmosphere, report);
            var root = new GameObject("Gruft");
            root.layer = environmentLayer;
            ctx.Root = root.transform;
            GruftGeometryBuilder.Build(geometry, layout.WallThickness, root.transform, materials, environmentLayer, report);
            GameObject player = GruftPlayerBuilder.Build(ctx, settings, testMaterials, combat, items, out Camera mainCamera);
            GruftObjectBuilder.Build(ctx);
            EnemySpawner spawner = GruftEnemyBuilder.Build(ctx, assets);
            Combatant playerCombatant = player.GetComponent<Combatant>();
            TestGroundCombatBuilder.CreateOverlays(playerCombatant, spawner, mainCamera, ctx.Font, report);
            MarkStatic(root.transform.Find("Boeden"));
            MarkStatic(root.transform.Find("Decken"));
            MarkStatic(root.transform.Find("Waende"));

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, GruftPaths.ScenePath))
            {
                report.Warning("Szene konnte nicht gespeichert werden: " + GruftPaths.ScenePath);
                return null;
            }

            report.Info("Szene gespeichert: " + GruftPaths.ScenePath);
            EnsureSceneList(report);
            TestGroundUiBuilder.EnsureWorldSpace(layout.WorldSpaceId, GruftPaths.ScenePath, layout.Name.Length > 0 ? layout.Name : "Die vergessene Gruft", report);
            AssetDatabase.SaveAssets();
            return player;
        }

        /// <summary>Reads and validates the layout file.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The layout, or null (warning) if it is missing or has errors.</returns>
        public static DungeonLayout LoadLayout(TestGroundReport report)
        {
            string path = Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, GruftPaths.LayoutPath);
            if (!File.Exists(path))
            {
                report.Warning("Layout-Datei fehlt: " + GruftPaths.LayoutPath);
                return null;
            }

            DungeonLayout layout;
            try
            {
                layout = DungeonLayoutReader.Read(File.ReadAllText(path));
            }
            catch (DungeonLayoutException exception)
            {
                report.Warning("Layout-Datei " + GruftPaths.LayoutPath + " ist fehlerhaft: " + exception.Message);
                return null;
            }

            DungeonLayoutReport check = DungeonLayoutValidator.Validate(layout);
            foreach (DungeonLayoutIssue issue in check.Issues)
            {
                if (issue.Severity == DungeonIssueSeverity.Error)
                {
                    report.Warning("Layout-Fehler: " + issue);
                }
                else
                {
                    report.Info("Layout-Hinweis: " + issue);
                }
            }

            if (!check.IsValid)
            {
                report.Warning("Das Layout hat " + check.ErrorCount + " Fehler – Szene nicht erstellt.");
                return null;
            }

            report.Info("Layout gelesen und geprüft: " + layout.Rooms.Count + " Räume, " + layout.Corridors.Count + " Gänge, " + layout.Objects.Count +
                        " Objekte, " + check.WarningCount + " Hinweise.");
            return layout;
        }

        private static bool EnsureFolders(TestGroundReport report)
        {
            string[] folders =
            {
                GruftPaths.SceneFolder, GruftPaths.MaterialFolder, GruftPaths.QuestItemFolder, TestGroundPaths.MaterialFolder, TestGroundPaths.PlayerSettingsFolder,
                SetupPaths.BootSettingsFolder, TestGroundPaths.AttackFolder, TestGroundPaths.WeaponFolder, TestGroundPaths.AbilityFolder, TestGroundPaths.EnemyFolder,
                TestGroundPaths.CombatSettingsFolder, TestGroundPaths.ItemFolder, TestGroundPaths.LootTableFolder, TestGroundPaths.ItemSettingsFolder
            };
            for (int i = 0; i < folders.Length; i++)
            {
                if (!TestGroundAssets.EnsureFolder(folders[i], report))
                {
                    return false;
                }
            }

            return true;
        }

        private static void RemoveSun(Scene scene)
        {
            GameObject[] roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                if (roots[i].TryGetComponent(out Light light) && light.type == LightType.Directional)
                {
                    UnityEngine.Object.DestroyImmediate(roots[i]);
                }
            }
        }

        private static void SetUpAtmosphere(DungeonAtmosphere atmosphere, TestGroundReport report)
        {
            // GDD 05 3.4 "Dungeon": dark, cold ambient light, torches as warm islands, the Aether glow turquoise.
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = GruftMaterials.Parse(atmosphere.AmbientColor, new Color(0.08f, 0.09f, 0.12f));
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = GruftMaterials.Parse(atmosphere.FogColor, Color.black);
            RenderSettings.fogDensity = atmosphere.FogDensity;
            RenderSettings.skybox = null;
            RenderSettings.sun = null;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            report.Info("Atmosphäre: Umgebungslicht " + atmosphere.AmbientColor + ", Nebel " + atmosphere.FogColor + " (Dichte " + atmosphere.FogDensity +
                        "), keine Sonne.");
        }

        private static void MarkStatic(Transform group)
        {
            if (group == null)
            {
                return;
            }

            GameObjectUtility.SetStaticEditorFlags(group.gameObject, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic |
                                                                     StaticEditorFlags.OccludeeStatic);
            for (int i = 0; i < group.childCount; i++)
            {
                GameObjectUtility.SetStaticEditorFlags(group.GetChild(i).gameObject, StaticEditorFlags.BatchingStatic |
                                                                                    StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
            }
        }

        private static Font LoadFont(TestGroundReport report)
        {
            try
            {
                Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                if (font != null)
                {
                    return font;
                }
            }
            catch (ArgumentException)
            {
                // Font name differs in this Unity version: no 3D texts.
            }

            report.Warning("Eingebaute Schrift „LegacyRuntime.ttf“ nicht gefunden – Inschriften und Schilder in der Gruft fehlen.");
            return null;
        }

        private static void EnsureSceneList(TestGroundReport report)
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            bool hasBoot = false;
            for (int i = 0; i < scenes.Count; i++)
            {
                if (scenes[i].path == SetupPaths.BootScenePath)
                {
                    hasBoot = true;
                }

                if (scenes[i].path == GruftPaths.ScenePath)
                {
                    if (!scenes[i].enabled)
                    {
                        scenes[i] = new EditorBuildSettingsScene(GruftPaths.ScenePath, true);
                        EditorBuildSettings.scenes = scenes.ToArray();
                    }

                    report.Info("Szenenliste enthält die Gruft bereits.");
                    return;
                }
            }

            if (!hasBoot && File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, SetupPaths.BootScenePath)))
            {
                scenes.Insert(0, new EditorBuildSettingsScene(SetupPaths.BootScenePath, true));
            }

            scenes.Add(new EditorBuildSettingsScene(GruftPaths.ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            report.Info("Szenenliste: Gruft hinten angehängt (" + scenes.Count + " Szenen).");
        }
    }
}
