using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds an enemy of the vertical slice by type and variant (GDD 01 11.4): grey wolves (the pack leader 20 % larger),
    /// bandits on the human rig (club; the leader in iron shoulder plates), the crossbowman with a launcher for bolts, and
    /// Risslinge on the small-creature rig that lie in ambush (<see cref="EnemyAmbush"/>; elite and the champion "Rissbrut"
    /// larger, the champion with a crystal core).
    /// </summary>
    public static class SliceEnemyBuilder
    {
        private const string RisslingGlowPath = TestGroundPaths.MaterialFolder + "/M_Rissling_Leuchten.mat";

        /// <summary>Builds one enemy.</summary>
        /// <param name="parent">Group object.</param>
        /// <param name="typeId">Enemy type id.</param>
        /// <param name="variant">Variant id.</param>
        /// <param name="definition">Enemy type at its level.</param>
        /// <param name="name">Object name.</param>
        /// <param name="number">Instance number.</param>
        /// <param name="localPosition">Position in the group.</param>
        /// <param name="yaw">Facing.</param>
        /// <param name="guard">Guard instead of patrol.</param>
        /// <param name="patrol">Patrol points or null.</param>
        /// <param name="materials">Test ground materials.</param>
        /// <param name="enemyLayer">Enemy layer or −1.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="report">Protocol.</param>
        public static EnemyController Build(Transform parent, string typeId, string variant, EnemyTypeDefinition definition, string name, string number,
            Vector3 localPosition, float yaw, bool guard, Transform[] patrol, TestGroundMaterials materials, int enemyLayer, int hurtboxLayer,
            int environmentLayer, TestGroundReport report)
        {
            switch (typeId)
            {
                case SliceEnemyAssets.BanditType:
                    return BuildHumanoid(parent, definition, name, number, localPosition, yaw, guard, patrol, variant == "elite" ? CharacterModels.BanditLeader
                        : CharacterModels.Bandit, false, variant == "elite" ? 1.05f : 1f, enemyLayer, hurtboxLayer, environmentLayer, report);
                case SliceEnemyAssets.CrossbowType:
                    return BuildHumanoid(parent, definition, name, number, localPosition, yaw, guard, patrol, CharacterModels.Crossbowman, true, 1f,
                        enemyLayer, hurtboxLayer, environmentLayer, report);
                case SliceEnemyAssets.RisslingType:
                    return BuildRissling(parent, definition, name, number, localPosition, yaw, guard, patrol, variant, materials, enemyLayer, hurtboxLayer,
                        environmentLayer, report);
                default:
                    bool aether = variant == "aether_verderbt" || (definition != null && definition.IsAetherCorrupted);
                    EnemyController wolf = TestGroundCombatBuilder.BuildWolf(parent, name, number, definition, aether ? materials.AetherWolf : materials.Wolf,
                        materials, localPosition, yaw, guard, patrol, enemyLayer, hurtboxLayer, environmentLayer, report);
                    if (variant == "elite")
                    {
                        // Rudelführer: 20 % larger than the pack (GDD 01 11.2 "Rüstungs- oder Farbvariante": here the size).
                        wolf.transform.localScale = Vector3.one * 1.2f;
                    }

                    return wolf;
            }
        }

        private static EnemyController BuildHumanoid(Transform parent, EnemyTypeDefinition definition, string name, string number, Vector3 localPosition,
            float yaw, bool guard, Transform[] patrol, string modelPath, bool crossbow, float scale, int enemyLayer, int hurtboxLayer, int environmentLayer,
            TestGroundReport report)
        {
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = localPosition;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            root.transform.localScale = Vector3.one * scale;
            if (enemyLayer >= 0)
            {
                root.layer = enemyLayer;
            }

            CharacterController controller = root.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.35f;
            controller.center = new Vector3(0f, 0.9f, 0f);
            controller.skinWidth = 0.03f;
            controller.stepOffset = 0.3f;
            controller.minMoveDistance = 0f;

            Transform body = Child(root.transform, "Body", new Vector3(0f, 0.95f, 0f));
            Transform weaponHand = Child(body, "Waffenhand", new Vector3(0.36f, 0.05f, 0.15f));
            Transform offHand = crossbow ? Child(body, "Stuetzhand", new Vector3(-0.1f, 0.15f, 0.45f)) : null;
            Transform muzzle = null;
            Renderer[] flashRenderers = new Renderer[0];
            Transform model = CharacterModels.Instantiate(modelPath, body, "Modell", root.layer, report);
            if (model != null)
            {
                model.localPosition = -body.localPosition;
                HumanoidPuppet puppet = model.gameObject.AddComponent<HumanoidPuppet>();
                puppet.BindByName(model);
                puppet.SetHandTargets(weaponHand, offHand);
                puppet.SetFallOnDeath(true);
                flashRenderers = model.GetComponentsInChildren<Renderer>();
            }

            if (crossbow)
            {
                // The crossbow lies in both hands in front of the chest, the bolt leaves its nut.
                weaponHand.localPosition = new Vector3(0.12f, 0.25f, 0.3f);
                Transform bow = CharacterModels.Instantiate(CharacterModels.Crossbow, weaponHand, "Armbrust", root.layer, report);
                muzzle = Child(weaponHand, "Muendung", new Vector3(0f, 0.04f, 0.45f));
                if (bow != null)
                {
                    bow.localRotation = Quaternion.identity;
                }
            }
            else
            {
                Transform club = CharacterModels.Instantiate(CharacterModels.Club, weaponHand, "Knueppel", root.layer, report);
                if (club != null)
                {
                    club.localRotation = Quaternion.Euler(-30f, 0f, 0f);
                }
            }

            Transform targetPoint = Child(root.transform, "TargetPoint", new Vector3(0f, 1.25f, 0f));
            HitFlash flash = root.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", flashRenderers, report);
            Combatant combatant = AddCombatant(root, definition, number, targetPoint, flash, report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.25f, 0f), new Vector3(0.6f, 1.3f, 0.45f), hurtboxLayer,
                report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 0.75f, 0f), new Vector3(0.34f, 0.34f, 0.34f), hurtboxLayer,
                report);
            StatusVisualsBuilder.Add(root, 1.8f, 0.4f, report);
            Hitbox hitbox = AddHitbox(root, combatant, hurtboxLayer, report);
            EnemyController enemy = AddController(root, definition, number, guard, patrol, hitbox, flash, body, null, environmentLayer, report);
            if (crossbow)
            {
                var boltRoot = new GameObject("Bolzen");
                boltRoot.transform.SetParent(root.transform, false);
                boltRoot.layer = root.layer;
                ProjectileLauncher launcher = boltRoot.AddComponent<ProjectileLauncher>();
                BowEffects.BuildArrow(boltRoot.transform, launcher, muzzle, hurtboxLayer, 1 << environmentLayer, report);
                TestGroundFields.SetReference(enemy, "projectiles", launcher, report);
            }

            AddReporter(root, combatant, definition, report);
            return enemy;
        }

        private static EnemyController BuildRissling(Transform parent, EnemyTypeDefinition definition, string name, string number, Vector3 localPosition,
            float yaw, bool guard, Transform[] patrol, string variant, TestGroundMaterials materials, int enemyLayer, int hurtboxLayer, int environmentLayer,
            TestGroundReport report)
        {
            float scale = variant == "champion" ? 1.7f : variant == "elite" ? 1.2f : 1f;
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = localPosition;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            root.transform.localScale = Vector3.one * scale;
            if (enemyLayer >= 0)
            {
                root.layer = enemyLayer;
            }

            CharacterController controller = root.AddComponent<CharacterController>();
            controller.height = 0.7f;
            controller.radius = 0.3f;
            controller.center = new Vector3(0f, 0.37f, 0f);
            controller.skinWidth = 0.03f;
            controller.stepOffset = 0.25f;
            controller.minMoveDistance = 0f;

            Transform body = Child(root.transform, "Body", new Vector3(0f, 0.3f, -0.2f));
            Renderer[] flashRenderers = new Renderer[0];
            Transform model = CharacterModels.Instantiate(CharacterModels.Rissling, body, "Modell", root.layer, report);
            Material glow = EnsureGlow(report);
            if (model != null)
            {
                model.localPosition = -body.localPosition;
                foreach (Renderer part in model.GetComponentsInChildren<Renderer>())
                {
                    Material[] slots = part.sharedMaterials;
                    for (int i = 0; i < slots.Length; i++)
                    {
                        if (slots[i] != null && slots[i].name.Contains("Leuchten"))
                        {
                            slots[i] = glow;
                        }
                    }

                    part.sharedMaterials = slots;
                }

                QuadrupedPuppet puppet = model.gameObject.AddComponent<QuadrupedPuppet>();
                puppet.BindByName(model);
                flashRenderers = model.GetComponentsInChildren<Renderer>();
            }

            Transform targetPoint = Child(root.transform, "TargetPoint", new Vector3(0f, 0.45f, 0.1f));
            HitFlash flash = root.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", flashRenderers, report);
            Combatant combatant = AddCombatant(root, definition, number, targetPoint, flash, report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.2f, 0.2f), new Vector3(0.45f, 0.45f, 0.9f), hurtboxLayer,
                report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 0.32f, 0.62f), new Vector3(0.3f, 0.28f, 0.32f), hurtboxLayer,
                report);
            GameObject core = null;
            if (definition != null && definition.HasCrystalCore)
            {
                core = new GameObject("Kristallkern");
                core.transform.SetParent(body, false);
                core.transform.localPosition = new Vector3(0f, 0.45f, 0.15f);
                core.transform.localRotation = Quaternion.Euler(45f, 0f, 45f);
                GameObject crystal = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.DestroyImmediate(crystal.GetComponent<Collider>());
                crystal.name = "Crystal";
                crystal.layer = root.layer;
                crystal.transform.SetParent(core.transform, false);
                crystal.transform.localScale = Vector3.one * 0.2f;
                crystal.GetComponent<Renderer>().sharedMaterial = glow != null ? glow : materials.Crystal;
                TestGroundCombatBuilder.AddHurtbox(core.transform, "Hurtbox_Kern", HitZone.WeakPoint, Vector3.zero, new Vector3(0.26f, 0.26f, 0.26f),
                    hurtboxLayer, report);
            }

            StatusVisualsBuilder.Add(root, 0.7f, 0.9f, report);
            Hitbox hitbox = AddHitbox(root, combatant, hurtboxLayer, report);
            EnemyController enemy = AddController(root, definition, number, guard, patrol, hitbox, flash, body, core, environmentLayer, report);

            // GDD 01 11.4 "springt aus Spalten": waits sunk into the ground until the player comes within 8 m.
            EnemyAmbush ambush = root.AddComponent<EnemyAmbush>();
            TestGroundFields.SetReference(ambush, "enemy", enemy, report);
            TestGroundFields.SetReference(ambush, "body", body, report);
            ParticleSystem burst = SpellVisualsBuilder.Burst(root.transform, "Hervorbrechen", new Color(0.75f, 0.6f, 1f), new Color(0.35f, 0.3f, 0.45f, 0.8f),
                0.4f, 0.8f, 1.5f, 4f, 0.12f, 0.35f, 50, ParticleSystemShapeType.Hemisphere, 0.5f, report);
            burst.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            TestGroundFields.SetReference(ambush, "burst", burst, report);
            AddReporter(root, combatant, definition, report);
            return enemy;
        }

        private static Combatant AddCombatant(GameObject root, EnemyTypeDefinition definition, string number, Transform targetPoint, HitFlash flash,
            TestGroundReport report)
        {
            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", definition != null ? definition.MaxHealth : 100f, report);
            TestGroundFields.SetBool(damageable, "regenerate", false, report);
            TestGroundFields.SetString(damageable, "ownerId", (definition != null ? definition.EnemyTypeId : "enemy") + "#" + number, report);
            Combatant combatant = root.AddComponent<Combatant>();
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Enemy, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, report);
            return combatant;
        }

        private static Hitbox AddHitbox(GameObject root, Combatant combatant, int hurtboxLayer, TestGroundReport report)
        {
            Hitbox hitbox = root.AddComponent<Hitbox>();
            TestGroundFields.SetReference(hitbox, "owner", combatant, report);
            TestGroundFields.SetInt(hitbox, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : ~0, report);
            return hitbox;
        }

        private static EnemyController AddController(GameObject root, EnemyTypeDefinition definition, string number, bool guard, Transform[] patrol,
            Hitbox hitbox, HitFlash flash, Transform body, GameObject core, int environmentLayer, TestGroundReport report)
        {
            EnemyController enemy = root.AddComponent<EnemyController>();
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
            return enemy;
        }

        private static void AddReporter(GameObject root, Combatant combatant, EnemyTypeDefinition definition, TestGroundReport report)
        {
            EnemyDeathReporter reporter = root.AddComponent<EnemyDeathReporter>();
            TestGroundFields.SetReference(reporter, "combatant", combatant, report);
            TestGroundFields.SetReference(reporter, "definition", definition, report);
        }

        private static Transform Child(Transform parent, string name, Vector3 localPosition)
        {
            var child = new GameObject(name);
            child.transform.SetParent(parent, false);
            child.transform.localPosition = localPosition;
            child.layer = parent.gameObject.layer;
            return child.transform;
        }

        private static Material EnsureGlow(TestGroundReport report)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(RisslingGlowPath);
            if (material == null)
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                material = new Material(shader) { name = "M_Rissling_Leuchten" };
                AssetDatabase.CreateAsset(material, RisslingGlowPath);
                report.Info("Angelegt: " + RisslingGlowPath);
            }

            var colour = new Color(0.56f, 0.42f, 1f);
            material.SetColor("_BaseColor", colour);
            material.SetColor("_EmissionColor", colour * 1.2f);
            material.EnableKeyword("_EMISSION");
            material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            EditorUtility.SetDirty(material);
            return material;
        }
    }
}
