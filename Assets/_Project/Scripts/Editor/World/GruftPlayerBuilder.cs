using Aetherfall.CameraSystem;
using Aetherfall.Combat;
using Aetherfall.DevTools;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Player;
using Aetherfall.Stats;
using Aetherfall.World.Dungeons;
using Unity.Cinemachine;
using Unity.Cinemachine.TargetTracking;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Player, cameras and helpers of the crypt scene, built like the test ground (<see cref="TestGroundSceneBuilder"/>: capsule
    /// with movement, stats, health, saving; Cinemachine exploration camera; combat and lock-on from
    /// <see cref="TestGroundCombatBuilder"/>; interaction, loot and equipment like <see cref="TestGroundItemBuilder"/>; HUD link),
    /// placed at the entrance anchor of the layout. The spawn point gets an <see cref="ArrivalAnchor"/> (arrival from Eichental).
    /// </summary>
    public static class GruftPlayerBuilder
    {
        private const float CharacterHeight = 1.8f;
        private const float CharacterRadius = 0.35f;

        /// <summary>Builds player, cameras, spawn point and overlays.</summary>
        /// <param name="ctx">Context (spawn point is stored there).</param>
        /// <param name="settings">Movement settings.</param>
        /// <param name="testMaterials">Materials of the test ground (player, sword, shield).</param>
        /// <param name="combat">Combat data of the player.</param>
        /// <param name="items">Item data (loot materials).</param>
        /// <param name="mainCamera">The main camera.</param>
        /// <returns>The player object.</returns>
        public static GameObject Build(GruftContext ctx, PlayerMovementSettings settings, TestGroundMaterials testMaterials, TestGroundCombatAssets combat,
            TestGroundItemAssets items, out Camera mainCamera)
        {
            TestGroundReport report = ctx.Report;
            DungeonSpawn spawn = ctx.Layout.Spawn;
            Vector3 spawnPosition = ctx.Position(spawn.X, spawn.Z, float.NaN, 0f);
            Quaternion spawnRotation = Quaternion.Euler(0f, spawn.Yaw, 0f);
            mainCamera = SetUpMainCamera(ctx, spawnPosition);

            GameObject player = CreatePlayer(settings, testMaterials, ctx.PlayerLayer, mainCamera, ctx.Layout.WorldSpaceId, report, out Transform pivot);
            player.transform.SetPositionAndRotation(spawnPosition, spawnRotation);
            int collisionMask = 1 << ctx.EnvironmentLayer;
            CameraLookInput look = CreateExplorationCamera(pivot, collisionMask, report, out CinemachineCamera exploreCamera,
                out CinemachineOrbitalFollow exploreOrbital);

            var spawnObject = new GameObject("PlayerSpawnPoint");
            spawnObject.transform.SetPositionAndRotation(spawnPosition, spawnRotation);
            PlayerSpawnPoint spawnPoint = spawnObject.AddComponent<PlayerSpawnPoint>();
            TestGroundFields.SetReference(spawnPoint, "player", player.GetComponent<PlayerMotor>(), report);
            TestGroundFields.SetString(spawnPoint, "worldSpaceId", ctx.Layout.WorldSpaceId, report);
            ctx.SpawnPoint = spawnObject.transform;

            var anchorObject = new GameObject("Ankunft " + spawn.AnchorId);
            anchorObject.transform.SetPositionAndRotation(spawnPosition, spawnRotation);
            ArrivalAnchor anchor = anchorObject.AddComponent<ArrivalAnchor>();
            TestGroundFields.SetString(anchor, "anchorId", spawn.AnchorId, report);
            TestGroundFields.SetReference(anchor, "spawnPoint", spawnObject.transform, report);
            // Inside the crypt no save on arrival: the entrance portal in Eichental saved before the travel (GDD 05 5.3).
            TestGroundFields.SetBool(anchor, "autosaveOnArrival", false, report);

            new GameObject("DevPlayStarter").AddComponent<DevPlayStarter>();
            new GameObject("QuickSaveInput").AddComponent<QuickSaveInput>();
            PlayerStatusDebugOverlay statusOverlay = new GameObject("PlayerStatusOverlay").AddComponent<PlayerStatusDebugOverlay>();
            TestGroundFields.SetReference(statusOverlay, "playerHealth", player.GetComponent<DamageableComponent>(), report);
            TestGroundFields.SetReference(statusOverlay, "playerStats", player.GetComponent<CharacterStatsComponent>(), report);

            TestGroundCombatBuilder.SetUpPlayer(player, mainCamera, testMaterials, combat, ctx.HurtboxLayer, ctx.EnvironmentLayer, report,
                abilityUnlockFlag: Narrative.MiniSliceQuestLibrary.FlagAetherPower);
            TestGroundCombatBuilder.SetUpCameras(player, pivot, exploreCamera, exploreOrbital, collisionMask, report);
            TestGroundFields.SetReference(look, "lockOn", player.GetComponent<PlayerLockOn>(), report);
            PlayerRespawn respawn = player.GetComponent<PlayerRespawn>();
            TestGroundFields.SetReference(respawn, "spawnPoint", spawnPoint, report);
            TestGroundFields.SetString(respawn, "regionId", ctx.Layout.RegionId, report);

            BuildLootRoot(items, ctx.PickupLayer, report);
            SetUpPlayerItems(player, ctx.InteractableLayer, ctx.PickupLayer, report);
            TestGroundItemBuilder.CreateOverlays(player, statusOverlay, report);
            PlayerProgression progression = player.AddComponent<PlayerProgression>();
            TestGroundFields.SetReference(progression, "stats", player.GetComponent<CharacterStatsComponent>(), report);
            TestGroundUiBuilder.AddPlayerHudLink(player, mainCamera, report);

            // Ser Maren comes along once she is in the group (she appears next to the player).
            var companions = new GameObject("Begleiter");
            CompanionBuilder.BuildMaren(companions.transform, spawnPosition - spawnRotation * Vector3.forward * 2f + spawnRotation * Vector3.right * 1.5f,
                spawn.Yaw, false, player, new EichentalMaterials(null, report), ctx.EnemyLayer, ctx.HurtboxLayer, ctx.InteractableLayer,
                1 << ctx.EnvironmentLayer, ctx.Font, report);
            report.Info("Spieler am Eingang der Gruft (" + spawn.X + " | " + spawn.Z + "), Blick nach Norden; Ankunfts-Anker " + spawn.AnchorId + ".");
            return player;
        }

        private static Camera SetUpMainCamera(GruftContext ctx, Vector3 spawnPosition)
        {
            Camera camera = null;
            GameObject[] roots = UnityEngine.SceneManagement.SceneManager.GetActiveScene().GetRootGameObjects();
            for (int i = 0; i < roots.Length && camera == null; i++)
            {
                camera = roots[i].GetComponentInChildren<Camera>(true);
            }

            if (camera == null)
            {
                camera = new GameObject("Main Camera").AddComponent<Camera>();
                camera.gameObject.AddComponent<AudioListener>();
            }

            camera.gameObject.name = "Main Camera";
            camera.gameObject.tag = "MainCamera";
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 300f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = GruftMaterials.Parse(ctx.Layout.Atmosphere.FogColor, Color.black);
            camera.transform.SetPositionAndRotation(spawnPosition + new Vector3(0f, TestGroundSceneBuilder.PivotHeight + 1.5f,
                -TestGroundSceneBuilder.CameraDistance), Quaternion.Euler(15f, 0f, 0f));
            CinemachineBrain brain = camera.gameObject.AddComponent<CinemachineBrain>();
            brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, 0.25f);
            EditorUtility.SetDirty(brain);
            return camera;
        }

        private static GameObject CreatePlayer(PlayerMovementSettings settings, TestGroundMaterials materials, int playerLayer, Camera mainCamera,
            string worldSpaceId, TestGroundReport report, out Transform pivot)
        {
            var player = new GameObject("Player");
            player.tag = "Player";
            if (playerLayer >= 0)
            {
                player.layer = playerLayer;
            }

            CharacterController controller = player.AddComponent<CharacterController>();
            controller.height = CharacterHeight;
            controller.radius = CharacterRadius;
            controller.center = new Vector3(0f, CharacterHeight * 0.5f, 0f);
            controller.skinWidth = 0.03f;
            controller.minMoveDistance = 0f;
            PlayerMovementTuning tuning = settings != null ? settings.CreateTuning() : PlayerMovementTuning.CreateDefault();
            controller.slopeLimit = tuning.ControllerSlopeLimit;
            controller.stepOffset = 0.3f;

            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Body";
            PrepareVisual(body, player.transform, new Vector3(0f, CharacterHeight * 0.5f, 0f),
                new Vector3(CharacterRadius * 2f, CharacterHeight * 0.5f, CharacterRadius * 2f), materials.Player, player.layer);
            GameObject nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
            nose.name = "Nose";
            PrepareVisual(nose, player.transform, new Vector3(0f, 1.45f, CharacterRadius + 0.1f), new Vector3(0.18f, 0.12f, 0.3f), materials.Nose,
                player.layer);

            pivot = new GameObject("CameraPivot").transform;
            pivot.SetParent(player.transform, false);
            pivot.localPosition = new Vector3(0f, TestGroundSceneBuilder.PivotHeight, 0f);

            PlayerMotor motor = player.AddComponent<PlayerMotor>();
            TestGroundFields.SetReference(motor, "settings", settings, report);
            TestGroundFields.SetReference(motor, "cameraTransform", mainCamera.transform, report);
            TestGroundFields.SetInt(motor, "groundLayers", playerLayer >= 0 ? ~(1 << playerLayer) : ~0, report);
            PlayerInputReader reader = player.AddComponent<PlayerInputReader>();
            TestGroundFields.SetReference(reader, "motor", motor, report);
            CharacterStatsComponent stats = player.AddComponent<CharacterStatsComponent>();
            TestGroundFields.SetReference(motor, "stats", stats, report);
            DamageableComponent damageable = player.AddComponent<DamageableComponent>();
            TestGroundFields.SetReference(damageable, "stats", stats, report);
            TestGroundFields.SetString(damageable, "ownerId", "player", report);
            PlayerPersistence persistence = player.AddComponent<PlayerPersistence>();
            TestGroundFields.SetReference(persistence, "motor", motor, report);
            TestGroundFields.SetReference(persistence, "health", damageable, report);
            TestGroundFields.SetReference(persistence, "stats", stats, report);
            TestGroundFields.SetString(persistence, "worldSpaceId", worldSpaceId, report);
            return player;
        }

        private static CameraLookInput CreateExplorationCamera(Transform pivot, int collisionMask, TestGroundReport report, out CinemachineCamera camera,
            out CinemachineOrbitalFollow orbitalFollow)
        {
            var cameraObject = new GameObject("CM_Explore");
            cameraObject.transform.position = pivot.position + new Vector3(0f, 1f, -TestGroundSceneBuilder.CameraDistance);
            CinemachineCamera vcam = cameraObject.AddComponent<CinemachineCamera>();
            vcam.Target.TrackingTarget = pivot;
            LensSettings lens = vcam.Lens;
            lens.FieldOfView = TestGroundSceneBuilder.FieldOfView;
            lens.NearClipPlane = 0.1f;
            lens.FarClipPlane = 300f;
            vcam.Lens = lens;

            CinemachineOrbitalFollow orbital = cameraObject.AddComponent<CinemachineOrbitalFollow>();
            orbital.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.Sphere;
            // Narrow rooms: a little closer than outside (3.5 m instead of 4 m), the deoccluder still pulls it in at walls.
            orbital.Radius = TestGroundSceneBuilder.CameraDistance - 0.5f;
            orbital.TargetOffset = Vector3.zero;
            TrackerSettings tracker = orbital.TrackerSettings;
            tracker.BindingMode = BindingMode.WorldSpace;
            tracker.PositionDamping = new Vector3(0.1f, 0.1f, 0.1f);
            orbital.TrackerSettings = tracker;
            orbital.RecenteringTarget = CinemachineOrbitalFollow.ReferenceFrames.TrackingTarget;
            const float recenterWait = 2f;
            const float recenterTime = 1f;
            orbital.VerticalAxis.Range = new Vector2(-20f, 70f);
            orbital.VerticalAxis.Wrap = false;
            orbital.VerticalAxis.Center = 15f;
            orbital.VerticalAxis.Value = 15f;
            orbital.VerticalAxis.Recentering.Enabled = true;
            orbital.VerticalAxis.Recentering.Wait = recenterWait;
            orbital.VerticalAxis.Recentering.Time = recenterTime;
            orbital.HorizontalAxis.Range = new Vector2(-180f, 180f);
            orbital.HorizontalAxis.Wrap = true;
            orbital.HorizontalAxis.Center = 0f;
            orbital.HorizontalAxis.Value = 0f;
            orbital.HorizontalAxis.Recentering.Enabled = false;
            orbital.HorizontalAxis.Recentering.Wait = recenterWait;
            orbital.HorizontalAxis.Recentering.Time = recenterTime;
            orbital.RadialAxis.Range = new Vector2(1f, 1f);
            orbital.RadialAxis.Wrap = false;
            orbital.RadialAxis.Center = 1f;
            orbital.RadialAxis.Value = 1f;
            orbital.RadialAxis.Recentering.Enabled = false;

            CinemachineRotationComposer composer = cameraObject.AddComponent<CinemachineRotationComposer>();
            ScreenComposerSettings composition = composer.Composition;
            composition.ScreenPosition = new Vector2(TestGroundSceneBuilder.ShoulderScreenOffset, 0f);
            composer.Composition = composition;
            composer.Damping = new Vector2(0.1f, 0.1f);
            composer.CenterOnActivate = true;

            CinemachineDeoccluder deoccluder = cameraObject.AddComponent<CinemachineDeoccluder>();
            deoccluder.CollideAgainst = collisionMask;
            deoccluder.IgnoreTag = "Player";
            deoccluder.TransparentLayers = 0;
            deoccluder.MinimumDistanceFromTarget = 0.3f;
            CinemachineDeoccluder.ObstacleAvoidance avoid = deoccluder.AvoidObstacles;
            avoid.Enabled = true;
            avoid.DistanceLimit = 0f;
            avoid.MinimumOcclusionTime = 0f;
            avoid.CameraRadius = TestGroundSceneBuilder.CameraCollisionRadius;
            avoid.Strategy = CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy.PullCameraForward;
            avoid.MaximumEffort = 4;
            avoid.SmoothingTime = 0f;
            avoid.Damping = 0.5f;
            avoid.DampingWhenOccluded = 0f;
            deoccluder.AvoidObstacles = avoid;

            CameraLookInput look = cameraObject.AddComponent<CameraLookInput>();
            TestGroundFields.SetReference(look, "orbitalFollow", orbital, report);
            TestGroundFields.SetReference(look, "cinemachineCamera", vcam, report);
            EditorUtility.SetDirty(vcam);
            EditorUtility.SetDirty(orbital);
            EditorUtility.SetDirty(composer);
            EditorUtility.SetDirty(deoccluder);
            camera = vcam;
            orbitalFollow = orbital;
            return look;
        }

        private static void BuildLootRoot(TestGroundItemAssets items, int pickupLayer, TestGroundReport report)
        {
            var root = new GameObject("Loot");
            LootBeamPool beams = root.AddComponent<LootBeamPool>();
            TestGroundFields.SetReference(beams, "beamMaterial", items.BeamMaterial, report);
            TestGroundFields.SetInt(beams, "maxBeams", LootBeamPool.DefaultMaxBeams, report);
            TestGroundFields.SetInt(beams, "minimumRarity", (int)ItemRarity.Rare, report);
            LootWorldSpawner spawner = root.AddComponent<LootWorldSpawner>();
            TestGroundFields.SetReference(spawner, "beams", beams, report);
            TestGroundFields.SetReference(spawner, "pickupMaterial", items.PickupMaterial, report);
            TestGroundFields.SetInt(spawner, "pickupLayer", pickupLayer >= 0 ? pickupLayer : 0, report);
        }

        private static void SetUpPlayerItems(GameObject player, int interactableLayer, int pickupLayer, TestGroundReport report)
        {
            int interactMask = (interactableLayer >= 0 ? 1 << interactableLayer : 0) | (pickupLayer >= 0 ? 1 << pickupLayer : 0);
            PlayerInteractor interactor = player.AddComponent<PlayerInteractor>();
            TestGroundFields.SetInt(interactor, "interactionLayers", interactMask, report);
            TestGroundFields.SetString(interactor, "interactorId", "player", report);
            if (player.TryGetComponent(out PlayerInputReader reader))
            {
                TestGroundFields.SetReference(reader, "interactor", interactor, report);
            }

            PlayerLootCollector collector = player.AddComponent<PlayerLootCollector>();
            TestGroundFields.SetInt(collector, "pickupLayers", pickupLayer >= 0 ? 1 << pickupLayer : 0, report);
            PlayerEquipment equipment = player.AddComponent<PlayerEquipment>();
            TestGroundFields.SetReference(equipment, "stats", player.GetComponent<CharacterStatsComponent>(), report);
            TestGroundFields.SetReference(equipment, "combat", player.GetComponent<PlayerCombatController>(), report);
            TestGroundFields.SetReference(equipment, "motor", player.GetComponent<PlayerMotor>(), report);
            Transform swordHand = player.transform.Find("SwordHand");
            Transform shieldHand = player.transform.Find("ShieldHand");
            Transform shield = shieldHand != null ? shieldHand.Find("Shield") : null;
            TestGroundFields.SetReference(equipment, "weaponVisual", swordHand != null ? swordHand.gameObject : null, report);
            TestGroundFields.SetReference(equipment, "shieldVisual", shield != null ? shield.gameObject : null, report);
        }

        private static void PrepareVisual(GameObject visual, Transform parent, Vector3 localPosition, Vector3 localScale, Material material, int layer)
        {
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = localScale;
            visual.layer = layer;
            if (visual.TryGetComponent(out Collider collider))
            {
                Object.DestroyImmediate(collider);
            }

            if (visual.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }
    }
}
