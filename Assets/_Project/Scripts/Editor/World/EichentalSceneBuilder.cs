using System;
using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.CameraSystem;
using Aetherfall.Cinematics;
using Aetherfall.Combat;
using Aetherfall.DevTools;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Player;
using Aetherfall.Stats;
using Aetherfall.World;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the scene <c>Scenes/World/Eichental.unity</c> from the layout (<see cref="RegionLayout"/>): light, sky and fog from
    /// the layout, terrain (<see cref="EichentalTerrainBuilder"/>), brooks, bridges, buildings (<see cref="EichentalBuildingBuilder"/>),
    /// vegetation, rocks, fields, fences (<see cref="EichentalNatureBuilder"/>), set pieces (<see cref="EichentalPropBuilder"/>),
    /// the Aether rift, and the gameplay part (<see cref="EichentalGameplayBuilder"/>: location zones, enemies, chests, NPC
    /// placeholders, quest objects, trails, start point). Player, cameras, HUD link and debug overlays are the same as in the test ground
    /// (<see cref="TestGroundSceneBuilder"/>, <see cref="TestGroundCombatBuilder"/>, <see cref="TestGroundItemBuilder"/>).
    /// </summary>
    /// <remarks>Layer: terrain 12 "Terrain"; the cameras and the enemies' line of sight treat Environment and Terrain as walls.</remarks>
    public static class EichentalSceneBuilder
    {
        /// <summary>Distance of the invisible walls behind the edge of the playable area (inside the border hills).</summary>
        public const float EdgeWallMargin = 14f;

        private const float MarenPostX = -171f;
        private const float MarenPostZ = -54f;
        private const float MarenPostYaw = 60f;

        /// <summary>Creates the scene in memory (replacing the open scenes), fills it and saves it.</summary>
        /// <param name="layout">Checked layout.</param>
        /// <param name="settings">Movement settings of the player.</param>
        /// <param name="testMaterials">Materials of player and enemies (shared with the test ground).</param>
        /// <param name="layers">Layer indices.</param>
        /// <param name="combat">Combat assets.</param>
        /// <param name="items">Item assets.</param>
        /// <param name="playerLevel">Level of the player object (the same as the start level of a new game).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The player object, or null if the scene could not be saved.</returns>
        public static GameObject Build(RegionLayout layout, PlayerMovementSettings settings, TestGroundMaterials testMaterials, WorldLayers layers,
            TestGroundCombatAssets combat, TestGroundItemAssets items, int playerLevel, TestGroundReport report)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            int env = layers.Environment >= 0 ? layers.Environment : 0;
            int envMask = 1 << env;
            int solidMask = envMask | (layers.Terrain >= 0 ? 1 << layers.Terrain : 0);

            var heights = new LayoutHeightField(layout);
            var materials = new EichentalMaterials(layout.Palette, report);
            var meshes = new EichentalMeshLibrary(report);
            Font labelFont = TestGroundSceneBuilder.LoadLabelFont(report);

            Light sun = SetUpLighting(scene, layout.Lighting, report);
            Camera mainCamera = TestGroundSceneBuilder.SetUpMainCamera(scene, report);

            // Landscape.
            var landscape = new GameObject("Landschaft");
            EichentalTerrainBuilder.Build(layout, heights, materials, landscape.transform, layers.Terrain, report);
            var nature = new EichentalNatureBuilder(layout, heights, materials, meshes, env, layers.Water >= 0 ? layers.Water : 0, report);
            nature.BuildWater(Group(landscape.transform, "Bäche"));
            nature.BuildVegetation(Group(landscape.transform, "Vegetation"));
            nature.BuildRocks(Group(landscape.transform, "Felsen"));
            BuildEdgeWalls(layout, Group(landscape.transform, "Weltrand"));

            // Settlements.
            var village = new GameObject("Siedlungen");
            var smoke = new EichentalSmoke(report);
            EichentalHouseKit kit = EichentalHouseKit.Load(materials, report);
            nature.Kit = kit;
            var buildings = new EichentalBuildingBuilder(materials, meshes, heights, smoke, env) { Kit = kit };
            Transform buildingGroup = Group(village.transform, "Gebäude");
            Transform fireGroup = EichentalBuildingBuilder.CreateFireGroup(village.transform, report);
            var towers = new WatchtowerBuilder(materials, meshes, heights, env, labelFont, report);
            for (int i = 0; i < layout.Buildings.Count; i++)
            {
                if (layout.Buildings[i].Kind == BuildingKind.Watchtower)
                {
                    // GDD 01: the Wachturm Grauwacht with the climbing route to the crow's nest (task list S48).
                    towers.Build(layout.Buildings[i], buildingGroup);
                    continue;
                }

                buildings.Build(layout.Buildings[i], i, buildingGroup, fireGroup);
            }

            report.Info("Gebäude: " + layout.Buildings.Count + " (intakt, verbrannt, eingestürzt laut Layout); Glut, Glutlicht und " + smoke.Count +
                        " Rauchsäulen unter „Brand (Prolog)“: sichtbar, bis " + EichentalBuildingBuilder.PrologueQuestId + " abgeschlossen ist.");
            nature.BuildFences(Group(village.transform, "Zäune"));
            nature.BuildFields(Group(village.transform, "Felder"));
            nature.BuildBridges(Group(village.transform, "Brücken"));
            new EichentalPropBuilder(materials, meshes, heights, env, layers.Interactable, layers.Hurtbox, labelFont, report)
                .BuildAll(layout, Group(village.transform, "Requisiten"));
            nature.BuildRift(null);

            // S35: the light follows the game clock (profile baked from the layout's dayCycle; the generated look is its 18:10).
            DayNightProfile dayProfile = DayNightBuilder.EnsureProfile(layout, EichentalPaths.DayNightProfilePath, report);
            if (dayProfile != null)
            {
                DayNightBuilder.AddOutdoorRig(sun, RenderSettings.skybox, dayProfile, new[] { village.transform, landscape.transform },
                    materials.Fixed("window", new Color(0.08f, 0.07f, 0.07f), 0.5f),
                    materials.FixedGlow("window_lit", new Color(0.08f, 0.07f, 0.07f), new Color(1f, 0.706f, 0.4f), 1.8f), report);
            }
            else
            {
                report.Warning("Kein dayCycle im Layout – das Licht bleibt statisch.");
            }

            // Player and cameras (like the test ground, but on the layout's start point and with terrain as an obstacle).
            var gameplay = new EichentalGameplayBuilder(layout, heights, materials, testMaterials, labelFont, report);
            GameObject player = TestGroundSceneBuilder.CreatePlayer(settings, testMaterials, layers.Player, mainCamera, report, out Transform pivot);
            TestGroundFields.SetString(player.GetComponent<PlayerPersistence>(), "worldSpaceId", layout.WorldSpaceId, report);
            PlayerSpawnPoint spawnPoint = gameplay.BuildSpawnPoint(player, layout.WorldSpaceId);
            mainCamera.transform.SetPositionAndRotation(pivot.position - player.transform.forward * TestGroundSceneBuilder.CameraDistance + Vector3.up,
                player.transform.rotation);
            CameraLookInput look = TestGroundSceneBuilder.CreateExplorationCamera(pivot, solidMask, report, out CinemachineCamera exploreCamera,
                out CinemachineOrbitalFollow exploreOrbital);
            exploreCamera.transform.SetPositionAndRotation(mainCamera.transform.position, mainCamera.transform.rotation);

            new GameObject("DevPlayStarter").AddComponent<DevPlayStarter>();
            new GameObject("QuickSaveInput").AddComponent<QuickSaveInput>();
            PlayerStatusDebugOverlay statusOverlay = TestGroundSceneBuilder.CreateStatusOverlay(player, report);

            Combatant playerCombatant = TestGroundCombatBuilder.SetUpPlayer(player, mainCamera, testMaterials, combat, layers.Hurtbox, env, report,
                playerLevel, Narrative.MiniSliceQuestLibrary.FlagAetherPower);
            TestGroundFields.SetInt(player.GetComponent<PlayerLockOn>(), "sightBlockers", solidMask, report);
            TestGroundCombatBuilder.SetProjectileSolids(player, solidMask, layers.Hurtbox, report);
            PlayerClassBuilder.AddTo(player, report);
            TestGroundCombatBuilder.SetUpCameras(player, pivot, exploreCamera, exploreOrbital, solidMask, report);
            TestGroundFields.SetReference(look, "lockOn", player.GetComponent<PlayerLockOn>(), report);
            PlayerRespawn respawn = player.GetComponent<PlayerRespawn>();
            TestGroundFields.SetReference(respawn, "spawnPoint", spawnPoint, report);
            TestGroundFields.SetString(respawn, "regionId", layout.RegionId, report);

            var game = new GameObject("Spiel");
            EnemySpawner firstSpawner = gameplay.BuildSpawners(Group(game.transform, "Gegner"), combat, layers.Enemy, layers.Hurtbox, env, solidMask);
            // GDD 02 11.6: Grimmbart's quarry with the boss fight.
            gameplay.BuildGrimmbart(Group(game.transform, "Grimmbart"), layers.Enemy, layers.Hurtbox, env, layers.Interactable, solidMask);
            TestGroundCombatBuilder.CreateOverlays(playerCombatant, firstSpawner, mainCamera, labelFont, report);

            TestGroundItemBuilder.BuildLootRoot(items, layers.Pickup, report);
            gameplay.BuildChests(Group(game.transform, "Truhen"), items, layers.Interactable, env);
            TestGroundItemBuilder.SetUpPlayer(player, layers.Interactable, layers.Pickup, report);
            TestGroundItemBuilder.CreateOverlays(player, statusOverlay, report);
            PlayerProgression progression = player.AddComponent<PlayerProgression>();
            TestGroundFields.SetReference(progression, "stats", player.GetComponent<CharacterStatsComponent>(), report);

            gameplay.BuildAreaTriggers(Group(game.transform, "Orte"), layers.TriggerVolume, layers.Player);
            // S34/S63: world map with fog, places and the viewpoints (crow's nest, Rabenfels summit).
            EichentalMapBuilder.Build(layout, heights, layout.WorldSpaceId, Group(game.transform, "Weltkarte"), layers.TriggerVolume, layers.Player, report);
            gameplay.BuildNpcMarkers(Group(game.transform, "NPC-Platzhalter"), player, layers.Interactable, layers.TriggerVolume, layers.Player, solidMask);
            // GDD 01 10.6: Ser Maren waits at the guard post of Lindenhain, next to Hauptmann Dorn.
            CompanionBuilder.BuildMaren(Group(game.transform, "Begleiter"), new Vector3(MarenPostX, (float)heights.Height(MarenPostX, MarenPostZ), MarenPostZ),
                MarenPostYaw, true, player, materials, layers.Enemy, layers.Hurtbox, layers.Interactable, solidMask, labelFont, report);
            gameplay.BuildQuestObjects(Group(game.transform, "Quest-Objekte"), env, layers.Interactable, layers.TriggerVolume, layers.Player, layers.Hurtbox);
            gameplay.BuildTrails(Group(game.transform, "Spuren"), layers.TriggerVolume, layers.Player);
            EichentalDungeonLinks.Build(layout, heights, spawnPoint.transform, layers.Interactable, Group(game.transform, "Durchgänge"), report);
            // S58: the prologue cutscene (Timeline baked from EichentalCutscenes; the fire group "Brand (Prolog)" is not touched).
            BuildCutscenes(layout, heights, Group(game.transform, "Zwischensequenzen"), mainCamera, exploreOrbital, solidMask, report);
            TestGroundUiBuilder.AddPlayerHudLink(player, mainCamera, report);

            report.Info("Meshes: " + meshes.Count + " in " + EichentalPaths.MeshLibraryPath + ".");
            AssetDatabase.SaveAssets();
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, EichentalPaths.ScenePath))
            {
                report.Warning("Szene konnte nicht gespeichert werden: " + EichentalPaths.ScenePath);
                return null;
            }

            report.Info("Szene gespeichert: " + EichentalPaths.ScenePath);
            return player;
        }

        private static void BuildCutscenes(RegionLayout layout, LayoutHeightField heights, Transform group, Camera mainCamera,
            CinemachineOrbitalFollow exploreOrbital, int solidMask, TestGroundReport report)
        {
            CutsceneScript prologue;
            try
            {
                var rest = new ExploreRestPose(TestGroundSceneBuilder.CameraDistance, TestGroundSceneBuilder.PivotHeight, exploreOrbital.VerticalAxis.Center,
                    TestGroundSceneBuilder.FieldOfView, TestGroundSceneBuilder.ShoulderScreenOffset);
                prologue = EichentalCutscenes.Prologue(layout, heights, rest);
            }
            catch (ArgumentException exception)
            {
                report.Warning("Prolog-Zwischensequenz nicht gebaut: " + exception.Message);
                return;
            }

            // The light column over Lina: a cold spot light from above, switched on by the Timeline during "Lina im Licht".
            CinePoint top = EichentalCutscenes.LightColumnPosition(layout, heights);
            var lightObject = new GameObject(EichentalCutscenes.LightColumnKey);
            lightObject.transform.SetPositionAndRotation(new Vector3((float)top.X, (float)top.Y, (float)top.Z), Quaternion.Euler(90f, 0f, 0f));
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Spot;
            light.color = new Color(0.9f, 1f, 0.99f);
            light.intensity = 40f;
            light.range = (float)EichentalCutscenes.LightColumnHeight + 6f;
            light.spotAngle = 32f;
            light.innerSpotAngle = 12f;
            light.shadows = LightShadows.None;
            var props = new Dictionary<string, GameObject> { { EichentalCutscenes.LightColumnKey, lightObject } };
            CutsceneTimelineBuilder.Build(prologue, group, mainCamera.GetComponent<CinemachineBrain>(), EichentalPaths.PrologueTimelinePath, heights,
                solidMask, props, report);
        }

        private static Transform Group(Transform parent, string name)
        {
            var group = new GameObject(name);
            group.transform.SetParent(parent, false);
            return group.transform;
        }

        private static Light SetUpLighting(Scene scene, LayoutLighting lighting, TestGroundReport report)
        {
            Light sun = null;
            GameObject[] roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length && sun == null; i++)
            {
                sun = roots[i].GetComponentInChildren<Light>(true);
            }

            if (sun == null)
            {
                sun = new GameObject("Sun").AddComponent<Light>();
            }

            sun.gameObject.name = "Sonne";
            sun.type = LightType.Directional;
            // The light travels away from the sun: azimuth + 180°, pitched down by the elevation.
            sun.transform.rotation = Quaternion.Euler((float)lighting.SunElevation, (float)lighting.SunAzimuth + 180f, 0f);
            sun.color = ToColor(lighting.SunColor);
            sun.intensity = (float)lighting.SunIntensity;
            sun.shadows = LightShadows.Soft;
            RenderSettings.sun = sun;

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ToColor(lighting.AmbientSky);
            RenderSettings.ambientEquatorColor = ToColor(lighting.AmbientEquator);
            RenderSettings.ambientGroundColor = ToColor(lighting.AmbientGround);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = ToColor(lighting.FogColor);
            RenderSettings.fogDensity = (float)lighting.FogDensity;

            Material sky = EnsureSkybox(lighting, report);
            if (sky != null)
            {
                RenderSettings.skybox = sky;
            }

            report.Info("Licht: Layout-Stand 18:10 (goldene Stunde) aus " + lighting.SunAzimuth + "° in " + lighting.SunElevation + "° Höhe, " +
                        "Umgebungslicht in drei Farben, leichter Dunst (Dichte " + lighting.FogDensity + "); zur Laufzeit folgt es der Uhr.");
            return sun;
        }

        private static Material EnsureSkybox(LayoutLighting lighting, TestGroundReport report)
        {
            Shader shader = Shader.Find("Skybox/Procedural");
            if (shader == null)
            {
                report.Warning("Shader „Skybox/Procedural“ nicht gefunden – die Szene nutzt den Standard-Himmel.");
                return null;
            }

            string path = EichentalPaths.MaterialFolder + "/M_Eichental_Himmel.mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader) { name = "M_Eichental_Himmel" };
                AssetDatabase.CreateAsset(material, path);
            }

            material.shader = shader;
            material.SetColor("_SkyTint", ToColor(lighting.SkyTop));
            material.SetColor("_GroundColor", ToColor(lighting.AmbientGround));
            material.SetFloat("_AtmosphereThickness", 1.1f);
            material.SetFloat("_Exposure", 1.2f);
            material.SetFloat("_SunSize", 0.04f);
            EditorUtility.SetDirty(material);
            return material;
        }

        /// <summary>
        /// Invisible walls a little behind the edge of the playable area (the border hills already rise there). Layer Default: they
        /// stop the player and the enemies, not the camera.
        /// </summary>
        private static void BuildEdgeWalls(RegionLayout layout, Transform parent)
        {
            LayoutBounds bounds = layout.Terrain.PlayableBounds;
            float minX = (float)bounds.Min.X - EdgeWallMargin;
            float maxX = (float)bounds.Max.X + EdgeWallMargin;
            float minZ = (float)bounds.Min.Z - EdgeWallMargin;
            float maxZ = (float)bounds.Max.Z + EdgeWallMargin;
            float height = (float)layout.Terrain.MaxHeight + 60f;
            float centerY = height * 0.5f - 10f;
            Wall(parent, "Rand Nord", new Vector3((minX + maxX) * 0.5f, centerY, maxZ), new Vector3(maxX - minX + 2f, height, 2f));
            Wall(parent, "Rand Süd", new Vector3((minX + maxX) * 0.5f, centerY, minZ), new Vector3(maxX - minX + 2f, height, 2f));
            Wall(parent, "Rand Ost", new Vector3(maxX, centerY, (minZ + maxZ) * 0.5f), new Vector3(2f, height, maxZ - minZ + 2f));
            Wall(parent, "Rand West", new Vector3(minX, centerY, (minZ + maxZ) * 0.5f), new Vector3(2f, height, maxZ - minZ + 2f));
        }

        private static void Wall(Transform parent, string name, Vector3 center, Vector3 size)
        {
            var wall = new GameObject(name);
            wall.transform.SetParent(parent, false);
            wall.transform.position = center;
            wall.AddComponent<BoxCollider>().size = size;
        }

        private static Color ToColor(LayoutColor color)
        {
            return new Color((float)color.R, (float)color.G, (float)color.B, 1f);
        }
    }
}
