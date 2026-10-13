using System;
using Aetherfall.CameraSystem;
using Aetherfall.DevTools;
using Aetherfall.Player;
using Unity.Cinemachine;
using Unity.Cinemachine.TargetTracking;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the scene <c>Scenes/Test/Testgelaende.unity</c> from scratch: light, obstacle course
    /// (<see cref="TestGroundGeometry"/>), player (capsule with "nose", CharacterController, <see cref="PlayerMotor"/>,
    /// <see cref="PlayerInputReader"/>), main camera with <see cref="CinemachineBrain"/>, exploration camera
    /// <c>CM_Explore</c> (Cinemachine 3: orbital follow, rotation composer, deoccluder, <see cref="CameraLookInput"/>),
    /// spawn point and <see cref="DevPlayStarter"/>.
    /// </summary>
    /// <remarks>Camera values: GDD 03 2.1 "Erkundung" (4.0 m, pivot 1.6 m, 0.3 m shoulder, FOV 55°) and 2.2 (collision).</remarks>
    public static class TestGroundSceneBuilder
    {
        /// <summary>Exploration camera distance (GDD 03 2.1).</summary>
        public const float CameraDistance = 4.0f;

        /// <summary>Camera pivot height above the feet (GDD 03 2.1).</summary>
        public const float PivotHeight = 1.6f;

        /// <summary>Vertical field of view (GDD 03 2.1 / GDD 05 4.2 default).</summary>
        public const float FieldOfView = 55f;

        /// <summary>
        /// Horizontal screen position of the player: about 0.3 m shoulder offset at 4 m distance (GDD 03 2.1). Negative =
        /// player left of the centre, the camera looks over the right shoulder.
        /// </summary>
        public const float ShoulderScreenOffset = -0.04f;

        /// <summary>Camera collision sphere radius (GDD 03 2.2: 0.25 m).</summary>
        public const float CameraCollisionRadius = 0.25f;

        private const float CharacterHeight = 1.8f;
        private const float CharacterRadius = 0.35f;

        /// <summary>Creates the scene in memory (replacing the open scenes), fills it and saves it.</summary>
        /// <param name="settings">Movement settings of the player.</param>
        /// <param name="materials">Materials.</param>
        /// <param name="playerLayer">Player layer index or -1.</param>
        /// <param name="environmentLayer">Environment layer index or -1.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The player object, or null if the scene could not be saved.</returns>
        public static GameObject Build(PlayerMovementSettings settings, TestGroundMaterials materials, int playerLayer, int environmentLayer,
            TestGroundReport report)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            int envLayer = environmentLayer >= 0 ? environmentLayer : 0;
            int envMask = 1 << envLayer;

            SetUpLight(scene);
            Camera mainCamera = SetUpMainCamera(scene, report);

            var environment = new GameObject("Environment");
            environment.layer = envLayer;
            new TestGroundGeometry(environment.transform, envLayer, materials, LoadLabelFont(report)).BuildAll();

            GameObject player = CreatePlayer(settings, materials, playerLayer, mainCamera, report, out Transform pivot);
            CreateExplorationCamera(pivot, envMask, report);

            var spawn = new GameObject("PlayerSpawnPoint");
            PlayerSpawnPoint spawnPoint = spawn.AddComponent<PlayerSpawnPoint>();
            SetReference(spawnPoint, "player", player.GetComponent<PlayerMotor>(), report);
            SetString(spawnPoint, "worldSpaceId", TestGroundPaths.WorldSpaceId, report);

            new GameObject("DevPlayStarter").AddComponent<DevPlayStarter>();

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, TestGroundPaths.ScenePath))
            {
                report.Warning("Szene konnte nicht gespeichert werden: " + TestGroundPaths.ScenePath);
                return null;
            }

            report.Info("Szene gespeichert: " + TestGroundPaths.ScenePath);
            return player;
        }

        private static void SetUpLight(Scene scene)
        {
            Light sun = FindInScene<Light>(scene);
            if (sun == null)
            {
                sun = new GameObject("Directional Light").AddComponent<Light>();
                sun.type = LightType.Directional;
            }

            sun.gameObject.name = "Sun";
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            sun.intensity = 1.2f;
            sun.shadows = LightShadows.Soft;
        }

        private static Camera SetUpMainCamera(Scene scene, TestGroundReport report)
        {
            Camera camera = FindInScene<Camera>(scene);
            if (camera == null)
            {
                camera = new GameObject("Main Camera").AddComponent<Camera>();
                camera.gameObject.AddComponent<AudioListener>();
            }

            camera.gameObject.name = "Main Camera";
            camera.gameObject.tag = "MainCamera";
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 1000f;
            camera.transform.SetPositionAndRotation(new Vector3(0f, PivotHeight + 1.5f, -CameraDistance), Quaternion.Euler(15f, 0f, 0f));

            CinemachineBrain brain = camera.gameObject.AddComponent<CinemachineBrain>();
            brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, 0.25f);
            EditorUtility.SetDirty(brain);
            report.Info("Main Camera mit CinemachineBrain (Standard-Blend 0,25 s, Architektur 11.2).");
            return camera;
        }

        private static GameObject CreatePlayer(PlayerMovementSettings settings, TestGroundMaterials materials, int playerLayer, Camera mainCamera,
            TestGroundReport report, out Transform pivot)
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
            // Walkable angle + 0.5° (PlayerMovementTuning.ControllerSlopeLimit), so the 45° ramp is not a rounding gamble.
            // The PlayerMotor sets the same value in Awake.
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
            pivot.localPosition = new Vector3(0f, PivotHeight, 0f);

            PlayerMotor motor = player.AddComponent<PlayerMotor>();
            SetReference(motor, "settings", settings, report);
            SetReference(motor, "cameraTransform", mainCamera.transform, report);
            int groundMask = playerLayer >= 0 ? ~(1 << playerLayer) : ~0;
            SetLayerMask(motor, "groundLayers", groundMask, report);

            PlayerInputReader reader = player.AddComponent<PlayerInputReader>();
            SetReference(reader, "motor", motor, report);
            report.Info("Spieler: Kapsel 1,8 m mit gelber „Nase“ (Blickrichtung), CharacterController, PlayerMotor, PlayerInputReader.");
            return player;
        }

        private static void CreateExplorationCamera(Transform pivot, int collisionMask, TestGroundReport report)
        {
            var cameraObject = new GameObject("CM_Explore");
            cameraObject.transform.position = pivot.position + new Vector3(0f, 1f, -CameraDistance);

            CinemachineCamera vcam = cameraObject.AddComponent<CinemachineCamera>();
            vcam.Target.TrackingTarget = pivot;
            LensSettings lens = vcam.Lens;
            lens.FieldOfView = FieldOfView;
            lens.NearClipPlane = 0.1f;
            lens.FarClipPlane = 1000f;
            vcam.Lens = lens;

            CinemachineOrbitalFollow orbital = cameraObject.AddComponent<CinemachineOrbitalFollow>();
            orbital.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.Sphere;
            orbital.Radius = CameraDistance;
            orbital.TargetOffset = Vector3.zero;
            TrackerSettings tracker = orbital.TrackerSettings;
            tracker.BindingMode = BindingMode.WorldSpace;
            tracker.PositionDamping = new Vector3(0.1f, 0.1f, 0.1f);
            orbital.TrackerSettings = tracker;
            orbital.RecenteringTarget = CinemachineOrbitalFollow.ReferenceFrames.TrackingTarget;

            // Vertical: pitch of the camera position in degrees; back to 15° after 2 s without camera input (GDD 05 4.2).
            const float recenterWait = 2f;
            const float recenterTime = 1f;
            orbital.VerticalAxis.Range = new Vector2(-20f, 70f);
            orbital.VerticalAxis.Wrap = false;
            orbital.VerticalAxis.Center = 15f;
            orbital.VerticalAxis.Value = 15f;
            orbital.VerticalAxis.Recentering.Enabled = true;
            orbital.VerticalAxis.Recentering.Wait = recenterWait;
            orbital.VerticalAxis.Recentering.Time = recenterTime;

            // Horizontal: free 360° orbit, no automatic recentering (it would fight the camera-relative steering, see guide).
            // Wait/Time still equal the vertical axis: CinemachineOrbitalFollow (3.1) lets input on one axis cancel the
            // recentering of another axis only if their recentering times are equal. Without that, turning the camera only
            // sideways would not stop the pitch from returning after 2 s.
            orbital.HorizontalAxis.Range = new Vector2(-180f, 180f);
            orbital.HorizontalAxis.Wrap = true;
            orbital.HorizontalAxis.Center = 0f;
            orbital.HorizontalAxis.Value = 0f;
            orbital.HorizontalAxis.Recentering.Enabled = false;
            orbital.HorizontalAxis.Recentering.Wait = recenterWait;
            orbital.HorizontalAxis.Recentering.Time = recenterTime;

            // Radial axis = distance multiplier; fixed at 1 (zoom options come later). Set explicitly so the camera never
            // ends up inside the player if the component defaults were not applied.
            orbital.RadialAxis.Range = new Vector2(1f, 1f);
            orbital.RadialAxis.Wrap = false;
            orbital.RadialAxis.Center = 1f;
            orbital.RadialAxis.Value = 1f;
            orbital.RadialAxis.Recentering.Enabled = false;

            CinemachineRotationComposer composer = cameraObject.AddComponent<CinemachineRotationComposer>();
            ScreenComposerSettings composition = composer.Composition;
            composition.ScreenPosition = new Vector2(ShoulderScreenOffset, 0f);
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
            avoid.CameraRadius = CameraCollisionRadius;
            avoid.Strategy = CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy.PullCameraForward;
            avoid.MaximumEffort = 4;
            avoid.SmoothingTime = 0f;
            avoid.Damping = 0.5f;            // GDD 03 2.2: move back out within 0.5 s
            avoid.DampingWhenOccluded = 0f;  // GDD 03 2.2: move in without delay
            deoccluder.AvoidObstacles = avoid;

            CameraLookInput look = cameraObject.AddComponent<CameraLookInput>();
            SetReference(look, "orbitalFollow", orbital, report);
            SetReference(look, "cinemachineCamera", vcam, report);

            EditorUtility.SetDirty(vcam);
            EditorUtility.SetDirty(orbital);
            EditorUtility.SetDirty(composer);
            EditorUtility.SetDirty(deoccluder);
            report.Info("Kamera CM_Explore: Abstand " + CameraDistance + " m, Pivot " + PivotHeight + " m, FOV " + FieldOfView +
                        "°, weiche Wandkollision (Radius " + CameraCollisionRadius + " m), Steuerung per CameraLookInput.");
        }

        private static void PrepareVisual(GameObject visual, Transform parent, Vector3 localPosition, Vector3 localScale, Material material, int layer)
        {
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = localScale;
            visual.layer = layer;
            if (visual.TryGetComponent(out Collider collider))
            {
                // The CharacterController is the only collider of the player.
                Object.DestroyImmediate(collider);
            }

            if (visual.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }

        private static Font LoadLabelFont(TestGroundReport report)
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
                // Font name differs in this Unity version: no labels.
            }

            report.Warning("Eingebaute Schrift „LegacyRuntime.ttf“ nicht gefunden – die Schilder im Testgelände fehlen.");
            return null;
        }

        private static T FindInScene<T>(Scene scene) where T : Component
        {
            GameObject[] roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                T component = roots[i].GetComponentInChildren<T>(true);
                if (component != null)
                {
                    return component;
                }
            }

            return null;
        }

        private static void SetReference(Object target, string field, Object value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetString(Object target, string field, string value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.stringValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetLayerMask(Object target, string field, int mask, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.intValue = mask;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static SerializedProperty Find(Object target, string field, TestGroundReport report, out SerializedObject serialized)
        {
            serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + target.GetType().Name + " nicht gefunden (Code umbenannt?). Bitte im Inspector von Hand setzen.");
            }

            return property;
        }
    }
}
