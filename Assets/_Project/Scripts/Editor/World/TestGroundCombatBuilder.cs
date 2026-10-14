using Aetherfall.AI;
using Aetherfall.CameraSystem;
using Aetherfall.Combat;
using Aetherfall.DevTools;
using Aetherfall.Events;
using Aetherfall.Player;
using Aetherfall.Stats;
using Unity.Cinemachine;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Combat part of the test ground: player combat components (combatant, hurtboxes, hitbox, lock-on, combat controller,
    /// placeholder sword and shield with procedural pose, respawn), the lock-on camera with target group, camera shake
    /// (impulse source and listeners), the arena with training dummy, two grey wolves and one Aether wolf, and the combat
    /// overlays. Called by <see cref="TestGroundSceneBuilder"/> while it builds the scene.
    /// </summary>
    /// <remarks>Arena: south-west of the spawn (centre −28/−42), dummy at −12/−16 (more than 25 m from the
    /// wolves, so the combat noise at the dummy does not reach them); values see docs/Anleitungen/05_Test_Kampf.md.</remarks>
    public static class TestGroundCombatBuilder
    {
        /// <summary>Position of the training dummy.</summary>
        public static readonly Vector3 DummyPosition = new Vector3(-12f, 0f, -16f);

        /// <summary>Centre of the wolf arena.</summary>
        public static readonly Vector3 ArenaCenter = new Vector3(-28f, 0f, -42f);

        /// <summary>
        /// Adds the combat components to the player and sets its stats to the warrior of GDD 03 8.3 (level 10, strength 20,
        /// dexterity 10, constitution 18). Weapon damage and armor come from the equipped items (<see cref="TestGroundItemBuilder"/>).
        /// The level is the same number as the start level of the ProgressionInstaller (<see cref="TestGroundAssets"/>), which sets
        /// it again when the progression binds the player; it only counts on its own when no ProgressionInstaller is registered.
        /// </summary>
        /// <param name="player">Player root.</param>
        /// <param name="mainCamera">Main camera.</param>
        /// <param name="materials">Materials.</param>
        /// <param name="assets">Combat assets.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The player's combatant.</returns>
        public static Combatant SetUpPlayer(GameObject player, Camera mainCamera, TestGroundMaterials materials, TestGroundCombatAssets assets,
            int hurtboxLayer, int environmentLayer, TestGroundReport report)
        {
            CharacterStatsComponent stats = player.GetComponent<CharacterStatsComponent>();
            DamageableComponent damageable = player.GetComponent<DamageableComponent>();
            PlayerMotor motor = player.GetComponent<PlayerMotor>();
            if (stats != null)
            {
                TestGroundFields.SetInt(stats, "level", Aetherfall.EditorTools.Narrative.TestGroundLevels.PlayerStartLevel, report);
                TestGroundFields.SetFloat(stats, "strength", 20f, report);
                TestGroundFields.SetFloat(stats, "dexterity", 10f, report);
                TestGroundFields.SetFloat(stats, "constitution", 18f, report);
            }

            Transform body = player.transform.Find("Body");
            HitFlash flash = player.AddComponent<HitFlash>();
            if (body != null && body.TryGetComponent(out Renderer bodyRenderer))
            {
                TestGroundFields.SetReferences(flash, "renderers", new Object[] { bodyRenderer }, report);
            }

            Transform targetPoint = CreateChild(player.transform, "TargetPoint", new Vector3(0f, 1.25f, 0f));
            Combatant combatant = player.AddComponent<Combatant>();
            TestGroundFields.SetString(combatant, "combatantId", "player", report);
            TestGroundFields.SetString(combatant, "typeId", "player", report);
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Player, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "stats", stats, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetBool(combatant, "usePoiseMeter", false, report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, report);

            AddHurtbox(player.transform, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.85f, 0f), new Vector3(0.6f, 1.3f, 0.6f), hurtboxLayer, report);
            AddHurtbox(player.transform, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 1.62f, 0f), new Vector3(0.32f, 0.32f, 0.32f), hurtboxLayer, report);

            Hitbox hitbox = player.AddComponent<Hitbox>();
            TestGroundFields.SetReference(hitbox, "owner", combatant, report);
            TestGroundFields.SetInt(hitbox, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : ~0, report);

            PlayerLockOn lockOn = player.AddComponent<PlayerLockOn>();
            TestGroundFields.SetReference(lockOn, "self", combatant, report);
            TestGroundFields.SetReference(lockOn, "cameraTransform", mainCamera.transform, report);
            TestGroundFields.SetInt(lockOn, "sightBlockers", 1 << environmentLayer, report);

            PlayerCombatController combat = player.AddComponent<PlayerCombatController>();
            TestGroundFields.SetReference(combat, "motor", motor, report);
            TestGroundFields.SetReference(combat, "combatant", combatant, report);
            TestGroundFields.SetReference(combat, "stats", stats, report);
            TestGroundFields.SetReference(combat, "hitbox", hitbox, report);
            TestGroundFields.SetReference(combat, "lockOn", lockOn, report);
            TestGroundFields.SetReference(combat, "cameraTransform", mainCamera.transform, report);
            TestGroundFields.SetReference(combat, "weapon", assets.Weapon, report);
            TestGroundFields.SetReference(combat, "shield", assets.Shield, report);
            TestGroundFields.SetReference(combat, "settings", assets.Settings, report);

            Transform swordHand = CreateChild(player.transform, "SwordHand", new Vector3(0.42f, 1.15f, 0.15f));
            CreateVisual(swordHand, "Sword Blade", PrimitiveType.Cube, new Vector3(0f, 0f, 0.6f), new Vector3(0.06f, 0.12f, 1.0f), materials.Sword,
                player.layer);
            CreateVisual(swordHand, "Sword Guard", PrimitiveType.Cube, new Vector3(0f, 0f, 0.07f), new Vector3(0.28f, 0.05f, 0.06f), materials.Sword,
                player.layer);
            Transform shieldHand = CreateChild(player.transform, "ShieldHand", new Vector3(-0.45f, 1.1f, 0.12f));
            GameObject shield = CreateVisual(shieldHand, "Shield", PrimitiveType.Cube, new Vector3(0f, 0f, 0.1f), new Vector3(0.55f, 0.7f, 0.08f),
                materials.Shield, player.layer);
            HitFlash shieldFlash = player.AddComponent<HitFlash>();
            if (shield.TryGetComponent(out Renderer shieldRenderer))
            {
                TestGroundFields.SetReferences(shieldFlash, "renderers", new Object[] { shieldRenderer }, report);
            }

            PlayerWeaponPose pose = player.AddComponent<PlayerWeaponPose>();
            TestGroundFields.SetReference(pose, "combat", combat, report);
            TestGroundFields.SetReference(pose, "weaponPivot", swordHand, report);
            TestGroundFields.SetReference(pose, "shieldPivot", shieldHand, report);
            TestGroundFields.SetReference(pose, "shieldFlash", shieldFlash, report);

            PlayerRespawn respawn = player.AddComponent<PlayerRespawn>();
            TestGroundFields.SetReference(respawn, "combatant", combatant, report);
            TestGroundFields.SetReference(respawn, "combat", combat, report);
            TestGroundFields.SetReference(respawn, "stats", stats, report);
            report.Info("Spieler-Kampf: Combatant, Trefferzonen (Körper, Kopf), Hitbox, Lock-On, Kampfsteuerung, Schwert und Schild (Quader), " +
                        "Wiederbeleben nach 3 s. Werte: Krieger Stufe 10 aus GDD 03, 8.3 (Stärke 20, Geschick 10, Konstitution 18; Rüstung und " +
                        "Waffenschaden aus der angelegten Ausrüstung).");
            return combatant;
        }

        /// <summary>Lock-on camera CM_LockOn with target group, camera shake source and listeners.</summary>
        /// <param name="player">Player root (with <see cref="PlayerLockOn"/>).</param>
        /// <param name="pivot">Camera pivot of the player.</param>
        /// <param name="exploreCamera">Exploration camera (gets an impulse listener).</param>
        /// <param name="exploreOrbital">Orbital follow of the exploration camera.</param>
        /// <param name="collisionMask">Camera collision layers.</param>
        /// <param name="report">Protocol.</param>
        public static void SetUpCameras(GameObject player, Transform pivot, CinemachineCamera exploreCamera, CinemachineOrbitalFollow exploreOrbital,
            int collisionMask, TestGroundReport report)
        {
            AddImpulseListener(exploreCamera.gameObject);

            var groupObject = new GameObject("LockOnTargetGroup");
            CinemachineTargetGroup group = groupObject.AddComponent<CinemachineTargetGroup>();
            group.PositionMode = CinemachineTargetGroup.PositionModes.GroupCenter;
            group.RotationMode = CinemachineTargetGroup.RotationModes.Manual;
            group.UpdateMethod = CinemachineTargetGroup.UpdateMethods.LateUpdate;
            EditorUtility.SetDirty(group);

            var cameraObject = new GameObject("CM_LockOn");
            cameraObject.transform.position = pivot.position + new Vector3(0.5f, 0.3f, -4.5f);
            CinemachineCamera vcam = cameraObject.AddComponent<CinemachineCamera>();
            vcam.Priority = 20;
            vcam.Target.TrackingTarget = pivot;
            vcam.Target.LookAtTarget = groupObject.transform;
            vcam.Target.CustomLookAtTarget = true;
            LensSettings lens = vcam.Lens;
            lens.FieldOfView = TestGroundSceneBuilder.FieldOfView + 3f;
            lens.NearClipPlane = 0.1f;
            lens.FarClipPlane = 1000f;
            vcam.Lens = lens;

            CinemachineThirdPersonFollow follow = cameraObject.AddComponent<CinemachineThirdPersonFollow>();
            follow.ShoulderOffset = new Vector3(0.5f, -0.1f, 0f);
            follow.VerticalArmLength = 0.4f;
            follow.CameraSide = 1f;
            follow.CameraDistance = 4.5f;
            follow.Damping = new Vector3(0.1f, 0.3f, 0.3f);
            CinemachineThirdPersonFollow.ObstacleSettings obstacles = follow.AvoidObstacles;
            obstacles.Enabled = true;
            obstacles.CollisionFilter = collisionMask;
            obstacles.IgnoreTag = "Player";
            obstacles.CameraRadius = TestGroundSceneBuilder.CameraCollisionRadius;
            obstacles.DampingIntoCollision = 0f;
            obstacles.DampingFromCollision = 0.5f;
            follow.AvoidObstacles = obstacles;

            CinemachineRotationComposer composer = cameraObject.AddComponent<CinemachineRotationComposer>();
            composer.Damping = new Vector2(0.3f, 0.3f);
            composer.CenterOnActivate = true;
            AddImpulseListener(cameraObject);

            LockOnCamera lockOnCamera = cameraObject.AddComponent<LockOnCamera>();
            TestGroundFields.SetReference(lockOnCamera, "lockOn", player.GetComponent<PlayerLockOn>(), report);
            TestGroundFields.SetReference(lockOnCamera, "lockOnCamera", vcam, report);
            TestGroundFields.SetReference(lockOnCamera, "thirdPersonFollow", follow, report);
            TestGroundFields.SetReference(lockOnCamera, "targetGroup", group, report);
            TestGroundFields.SetReference(lockOnCamera, "playerMember", pivot, report);
            TestGroundFields.SetReference(lockOnCamera, "exploreOrbital", exploreOrbital, report);
            vcam.enabled = false;
            EditorUtility.SetDirty(vcam);
            EditorUtility.SetDirty(follow);
            EditorUtility.SetDirty(composer);

            var shakeObject = new GameObject("CameraShake");
            CinemachineImpulseSource source = shakeObject.AddComponent<CinemachineImpulseSource>();
            source.ImpulseDefinition = new CinemachineImpulseDefinition
            {
                ImpulseChannel = 1,
                ImpulseShape = CinemachineImpulseDefinition.ImpulseShapes.Bump,
                ImpulseType = CinemachineImpulseDefinition.ImpulseTypes.Uniform,
                ImpulseDuration = 0.2f,
                DissipationDistance = 100f,
                DissipationRate = 0.25f,
                PropagationSpeed = 343f
            };
            source.DefaultVelocity = Vector3.down;
            EditorUtility.SetDirty(source);
            CameraImpulseOnHit shake = shakeObject.AddComponent<CameraImpulseOnHit>();
            TestGroundFields.SetReference(shake, "impulseSource", source, report);
            report.Info("Lock-On-Kamera CM_LockOn (Third Person Follow 4,5–7 m, Blick auf Zielgruppe Spieler + Ziel, Priorität 20) und " +
                        "Kamera-Wackeln per Cinemachine Impulse (Quelle „CameraShake“, Listener an beiden Kameras).");
        }

        /// <summary>Builds training dummy, wolves and the spawner of the arena.</summary>
        /// <param name="materials">Materials.</param>
        /// <param name="assets">Combat assets.</param>
        /// <param name="enemyLayer">Enemy layer or −1.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="labelFont">Font for labels (may be null).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The spawner of the wolves.</returns>
        public static EnemySpawner BuildArena(TestGroundMaterials materials, TestGroundCombatAssets assets, int enemyLayer, int hurtboxLayer,
            int environmentLayer, Font labelFont, TestGroundReport report)
        {
            var arena = new GameObject("Arena");
            arena.transform.position = ArenaCenter;
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            floor.name = "Arena Floor";
            floor.transform.SetParent(arena.transform, false);
            floor.transform.localScale = new Vector3(26f, 0.01f, 26f);
            floor.transform.localPosition = new Vector3(0f, 0.012f, 0f);
            Object.DestroyImmediate(floor.GetComponent<Collider>());
            SetMaterial(floor, materials.Arena);
            CreateLabel(arena.transform, "Kampfarena: 2 Wölfe + 1 Aether-Wolf", new Vector3(0f, 2.5f, 13f), labelFont);
            CreateRock(arena.transform, new Vector3(4f, 0f, 3f), new Vector3(2.2f, 1.6f, 1.8f), materials, environmentLayer);
            CreateRock(arena.transform, new Vector3(-6f, 0f, -2f), new Vector3(1.6f, 2.2f, 1.6f), materials, environmentLayer);

            BuildDummy(materials, hurtboxLayer, environmentLayer, labelFont, report);

            EnemyController wolf1 = BuildWolf(arena.transform, "Grauwolf 1", "1", assets.Wolf, materials.Wolf, materials, new Vector3(-2f, 0f, 2f),
                160f, true, null, enemyLayer, hurtboxLayer, environmentLayer, report);
            var patrolA = CreateChild(arena.transform, "Patrouille A", new Vector3(6f, 0f, 2f));
            var patrolB = CreateChild(arena.transform, "Patrouille B", new Vector3(6f, 0f, -8f));
            EnemyController wolf2 = BuildWolf(arena.transform, "Grauwolf 2", "2", assets.Wolf, materials.Wolf, materials, new Vector3(6f, 0f, -3f),
                0f, false, new[] { patrolA, patrolB }, enemyLayer, hurtboxLayer, environmentLayer, report);
            EnemyController aetherWolf = BuildWolf(arena.transform, "Aether-Wolf", "3", assets.AetherWolf, materials.AetherWolf, materials,
                new Vector3(-2f, 0f, -6f), 200f, true, null, enemyLayer, hurtboxLayer, environmentLayer, report);

            EnemySpawner spawner = arena.AddComponent<EnemySpawner>();
            TestGroundFields.SetReferences(spawner, "enemies", new Object[] { wolf1, wolf2, aetherWolf }, report);
            report.Info("Arena bei (−28 | −42): 2 Grauwölfe (Stufe 8: 144 LP, Biss 46, Rüstung 28, Haltung 35; einer patrouilliert) und " +
                        "1 Aether-Wolf (+25 % Aether-Schaden, Kristallkern = Schwachpunkt ×2). Trainingspuppe bei (−12 | −16).");
            return spawner;
        }

        /// <summary>Combat overlay and damage numbers.</summary>
        /// <param name="player">Player combatant.</param>
        /// <param name="spawner">Wolf spawner.</param>
        /// <param name="mainCamera">Main camera.</param>
        /// <param name="font">Font of the damage numbers (may be null).</param>
        /// <param name="report">Protocol.</param>
        public static void CreateOverlays(Combatant player, EnemySpawner spawner, Camera mainCamera, Font font, TestGroundReport report)
        {
            FloatingDamageNumbers numbers = new GameObject("DamageNumbers").AddComponent<FloatingDamageNumbers>();
            TestGroundFields.SetReference(numbers, "cameraTransform", mainCamera.transform, report);
            TestGroundFields.SetReference(numbers, "font", font, report);
            CombatDebugOverlay overlay = new GameObject("CombatOverlay").AddComponent<CombatDebugOverlay>();
            TestGroundFields.SetReference(overlay, "player", player, report);
            TestGroundFields.SetReference(overlay, "spawner", spawner, report);
            TestGroundFields.SetReference(overlay, "damageNumbers", numbers, report);
            report.Info("Kampf-Overlay „CombatOverlay“ (links unten) und Schadenszahlen „DamageNumbers“.");
        }

        private static void BuildDummy(TestGroundMaterials materials, int hurtboxLayer, int environmentLayer, Font labelFont, TestGroundReport report)
        {
            var dummy = new GameObject("Trainingspuppe");
            dummy.transform.SetPositionAndRotation(DummyPosition, Quaternion.Euler(0f, 0f, 0f));
            GameObject post = CreateVisual(dummy.transform, "Post", PrimitiveType.Cylinder, new Vector3(0f, 0.9f, 0f), new Vector3(0.45f, 0.9f, 0.45f),
                materials.Dummy, dummy.layer);
            GameObject head = CreateVisual(dummy.transform, "Head", PrimitiveType.Sphere, new Vector3(0f, 1.95f, 0f), new Vector3(0.38f, 0.38f, 0.38f),
                materials.Dummy, dummy.layer);
            CreateVisual(dummy.transform, "Arms", PrimitiveType.Cube, new Vector3(0f, 1.45f, 0f), new Vector3(1.3f, 0.12f, 0.12f), materials.Dummy,
                dummy.layer);

            var solid = new GameObject("Solid");
            solid.transform.SetParent(dummy.transform, false);
            solid.layer = environmentLayer;
            CapsuleCollider capsule = solid.AddComponent<CapsuleCollider>();
            capsule.center = new Vector3(0f, 1f, 0f);
            capsule.height = 2f;
            capsule.radius = 0.3f;

            DamageableComponent damageable = dummy.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", 9999f, report);
            TestGroundFields.SetBool(damageable, "regenerate", false, report);
            TestGroundFields.SetString(damageable, "ownerId", "trainingspuppe", report);
            HitFlash flash = dummy.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", new Object[] { post.GetComponent<Renderer>(), head.GetComponent<Renderer>() }, report);
            Transform targetPoint = CreateChild(dummy.transform, "TargetPoint", new Vector3(0f, 1.4f, 0f));
            Combatant combatant = dummy.AddComponent<Combatant>();
            TestGroundFields.SetString(combatant, "combatantId", "trainingspuppe", report);
            TestGroundFields.SetString(combatant, "typeId", "object.trainingspuppe", report);
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Neutral, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetInt(combatant, "level", 8, report);
            TestGroundFields.SetFloat(combatant, "armor", 28f, report);
            TestGroundFields.SetFloat(combatant, "maxPoise", 35f, report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, report);
            AddHurtbox(dummy.transform, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.95f, 0f), new Vector3(0.7f, 1.6f, 0.7f), hurtboxLayer, report);
            AddHurtbox(dummy.transform, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 1.95f, 0f), new Vector3(0.42f, 0.42f, 0.42f), hurtboxLayer, report);

            TextMesh label = null;
            if (labelFont != null)
            {
                label = CreateLabel(dummy.transform, "Trainingspuppe", new Vector3(0f, 2.9f, 0f), labelFont);
                label.characterSize = 0.04f;
            }

            TrainingDummy logic = dummy.AddComponent<TrainingDummy>();
            TestGroundFields.SetReference(logic, "label", label, report);
            TestGroundFields.SetReference(logic, "hitFlash", flash, report);
        }

        internal static EnemyController BuildWolf(Transform parent, string name, string number, EnemyTypeDefinition definition, Material furMaterial,
            TestGroundMaterials materials, Vector3 localPosition, float yaw, bool guard, Transform[] patrol, int enemyLayer, int hurtboxLayer,
            int environmentLayer, TestGroundReport report)
        {
            var wolf = new GameObject(name);
            wolf.transform.SetParent(parent, false);
            wolf.transform.localPosition = localPosition;
            wolf.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            if (enemyLayer >= 0)
            {
                wolf.layer = enemyLayer;
            }

            CharacterController controller = wolf.AddComponent<CharacterController>();
            controller.height = 0.9f;
            controller.radius = 0.38f;
            controller.center = new Vector3(0f, 0.47f, 0f);
            controller.skinWidth = 0.03f;
            controller.stepOffset = 0.25f;
            controller.minMoveDistance = 0f;

            // Body pivot at hip height: rotating it around X makes the wolf rear up (telegraph) or fall over (death).
            Transform body = CreateChild(wolf.transform, "Body", new Vector3(0f, 0.35f, -0.3f));
            GameObject torso = CreateVisual(body, "Torso", PrimitiveType.Cube, new Vector3(0f, 0.25f, 0.3f), new Vector3(0.5f, 0.55f, 1.25f), furMaterial,
                wolf.layer);
            GameObject head = CreateVisual(body, "Head", PrimitiveType.Cube, new Vector3(0f, 0.5f, 1.05f), new Vector3(0.38f, 0.36f, 0.42f), furMaterial,
                wolf.layer);
            CreateVisual(body, "Snout", PrimitiveType.Cube, new Vector3(0f, 0.42f, 1.35f), new Vector3(0.2f, 0.18f, 0.25f), materials.Nose, wolf.layer);
            CreateVisual(body, "Tail", PrimitiveType.Cube, new Vector3(0f, 0.35f, -0.45f), new Vector3(0.1f, 0.1f, 0.45f), furMaterial, wolf.layer);
            for (int i = 0; i < 4; i++)
            {
                float x = i % 2 == 0 ? -0.18f : 0.18f;
                float z = i < 2 ? 0.75f : -0.15f;
                CreateVisual(body, "Leg " + (i + 1), PrimitiveType.Cube, new Vector3(x, -0.12f, z), new Vector3(0.12f, 0.5f, 0.12f), furMaterial, wolf.layer);
            }

            Transform targetPoint = CreateChild(wolf.transform, "TargetPoint", new Vector3(0f, 0.7f, 0.2f));
            HitFlash flash = wolf.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", new Object[] { torso.GetComponent<Renderer>(), head.GetComponent<Renderer>() }, report);

            DamageableComponent damageable = wolf.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", definition != null ? definition.MaxHealth : 144f, report);
            TestGroundFields.SetBool(damageable, "regenerate", false, report);
            TestGroundFields.SetString(damageable, "ownerId", (definition != null ? definition.EnemyTypeId : "enemy") + "#" + number, report);

            Combatant combatant = wolf.AddComponent<Combatant>();
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Enemy, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, report);

            AddHurtbox(body, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.25f, 0.3f), new Vector3(0.6f, 0.65f, 1.35f), hurtboxLayer, report);
            AddHurtbox(body, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 0.5f, 1.12f), new Vector3(0.42f, 0.42f, 0.55f), hurtboxLayer, report);
            GameObject core = null;
            if (definition != null && definition.HasCrystalCore)
            {
                core = new GameObject("Kristallkern");
                core.transform.SetParent(body, false);
                core.transform.localPosition = new Vector3(0f, 0.65f, 0.25f);
                core.transform.localRotation = Quaternion.Euler(45f, 0f, 45f);
                CreateVisual(core.transform, "Crystal", PrimitiveType.Cube, Vector3.zero, new Vector3(0.28f, 0.28f, 0.28f), materials.Crystal, wolf.layer);
                AddHurtbox(core.transform, "Hurtbox_Kern", HitZone.WeakPoint, Vector3.zero, new Vector3(0.36f, 0.36f, 0.36f), hurtboxLayer, report);
            }

            Hitbox hitbox = wolf.AddComponent<Hitbox>();
            TestGroundFields.SetReference(hitbox, "owner", combatant, report);
            TestGroundFields.SetInt(hitbox, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : ~0, report);

            EnemyController enemy = wolf.AddComponent<EnemyController>();
            TestGroundFields.SetReference(enemy, "definition", definition, report);
            TestGroundFields.SetString(enemy, "instanceNumber", number, report);
            TestGroundFields.SetBool(enemy, "guard", guard, report);
            TestGroundFields.SetReferences(enemy, "patrolPoints", patrol != null ? (Object[])patrol : new Object[0], report);
            TestGroundFields.SetReference(enemy, "hitbox", hitbox, report);
            TestGroundFields.SetReference(enemy, "hitFlash", flash, report);
            TestGroundFields.SetReference(enemy, "body", body, report);
            TestGroundFields.SetReference(enemy, "crystalCore", core, report);
            TestGroundFields.SetInt(enemy, "obstacleLayers", 1 << environmentLayer, report);
            TestGroundFields.SetInt(enemy, "sightBlockers", 1 << environmentLayer, report);

            EnemyDeathReporter reporter = wolf.AddComponent<EnemyDeathReporter>();
            TestGroundFields.SetReference(reporter, "combatant", combatant, report);
            TestGroundFields.SetReference(reporter, "definition", definition, report);
            return enemy;
        }

        private static void AddHurtbox(Transform parent, string name, HitZone zone, Vector3 localCenter, Vector3 size, int hurtboxLayer,
            TestGroundReport report)
        {
            var zoneObject = new GameObject(name);
            zoneObject.transform.SetParent(parent, false);
            zoneObject.transform.localPosition = localCenter;
            if (hurtboxLayer >= 0)
            {
                zoneObject.layer = hurtboxLayer;
            }

            BoxCollider box = zoneObject.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.size = size;
            Hurtbox hurtbox = zoneObject.AddComponent<Hurtbox>();
            TestGroundFields.SetInt(hurtbox, "zone", (int)zone, report);
            Combatant owner = parent.GetComponentInParent<Combatant>();
            if (owner != null)
            {
                TestGroundFields.SetReference(hurtbox, "owner", owner, report);
            }
        }

        private static void AddImpulseListener(GameObject cameraObject)
        {
            CinemachineImpulseListener listener = cameraObject.AddComponent<CinemachineImpulseListener>();
            listener.ApplyAfter = CinemachineCore.Stage.Noise;
            listener.ChannelMask = 1;
            listener.Gain = 1f;
            listener.Use2DDistance = false;
            listener.UseCameraSpace = true;
            listener.SignalCombinationMode = CinemachineImpulseListener.SignalCombinationModes.Additive;
            listener.ReactionSettings = new CinemachineImpulseListener.ImpulseReaction { AmplitudeGain = 1f, FrequencyGain = 1f, Duration = 1f };
            EditorUtility.SetDirty(listener);
        }

        private static void CreateRock(Transform parent, Vector3 localPosition, Vector3 size, TestGroundMaterials materials, int environmentLayer)
        {
            GameObject rock = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rock.name = "Fels";
            rock.layer = environmentLayer;
            rock.transform.SetParent(parent, false);
            rock.transform.localPosition = localPosition + new Vector3(0f, size.y * 0.5f, 0f);
            rock.transform.localRotation = Quaternion.Euler(0f, 25f, 0f);
            rock.transform.localScale = size;
            SetMaterial(rock, materials.Wall);
        }

        private static Transform CreateChild(Transform parent, string name, Vector3 localPosition)
        {
            var child = new GameObject(name);
            child.transform.SetParent(parent, false);
            child.transform.localPosition = localPosition;
            child.layer = parent.gameObject.layer;
            return child.transform;
        }

        private static GameObject CreateVisual(Transform parent, string name, PrimitiveType type, Vector3 localPosition, Vector3 localScale,
            Material material, int layer)
        {
            GameObject visual = GameObject.CreatePrimitive(type);
            visual.name = name;
            visual.layer = layer;
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = localScale;
            if (visual.TryGetComponent(out Collider collider))
            {
                // Visuals never collide; movement uses the CharacterController, hits use the hurtboxes.
                Object.DestroyImmediate(collider);
            }

            SetMaterial(visual, material);
            return visual;
        }

        private static void SetMaterial(GameObject target, Material material)
        {
            if (material != null && target.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }

        private static TextMesh CreateLabel(Transform parent, string text, Vector3 localPosition, Font font)
        {
            if (font == null)
            {
                return null;
            }

            var label = new GameObject("Label " + text);
            label.transform.SetParent(parent, false);
            label.transform.localPosition = localPosition;
            label.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = font;
            mesh.fontSize = 64;
            mesh.characterSize = 0.06f;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = Color.white;
            if (label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = font.material;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            return mesh;
        }
    }
}
