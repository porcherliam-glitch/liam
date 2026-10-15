using System;
using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Events;
using Aetherfall.World;
using Aetherfall.World.Puzzles;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Grimmbart's quarry arena and the boss himself (GDD 02 11.6): the kettle of about 30 × 30 m with 4 stone blocks as cover
    /// (a charge into one stuns him), 2 oil barrels, the crane with its falling stones, the water channel at the edge; Grimmbart
    /// with <see cref="BossController"/> (3 phases, kneeling at 10 %), his war horn with 4 bandits it can call, crane, fire
    /// pots, the armour he tears off in phase 3, the barrel kick and the "Fesseln" interaction.
    /// </summary>
    public static class GrimmbartBuilder
    {
        private const float HalfEncounter = 11f;
        private const float HalfBounds = 24f;
        private const float HalfDropArea = 13f;

        /// <summary>Builds the arena around <paramref name="center"/> (the middle of the kettle floor).</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="center">Middle of the arena floor (world).</param>
        /// <param name="ground">Terrain height at (x, z).</param>
        /// <param name="regionId">Region id for the kill report.</param>
        /// <param name="enemyLayer">Enemy layer or −1.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="interactableLayer">Interaction layer or −1.</param>
        /// <param name="solidMask">Layers that count as ground and block the sight.</param>
        /// <param name="materials">Test ground materials.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The boss.</returns>
        public static BossController Build(Transform parent, Vector3 center, Func<float, float, float> ground, string regionId, int enemyLayer,
            int hurtboxLayer, int environmentLayer, int interactableLayer, int solidMask, TestGroundMaterials materials, TestGroundReport report)
        {
            GrimmbartAssets.EnsureAll(report);
            var root = new GameObject("Grimmbarts Steinbruch (" + GrimmbartAssets.BossId + ")");
            root.transform.SetParent(parent, false);
            Vector3 At(float dx, float dz) => new Vector3(center.x + dx, ground(center.x + dx, center.z + dz), center.z + dz);

            Material stone = TestGroundAssets.EnsureMaterial("Steinbruch_Block", new Color(0.55f, 0.52f, 0.47f), report);
            Material trough = TestGroundAssets.EnsureMaterial("Steinbruch_Rinne", new Color(0.42f, 0.4f, 0.37f), report);
            Material water = TestGroundAssets.EnsureMaterial("Steinbruch_Wasser", new Color(0.22f, 0.38f, 0.48f), report);
            Material shadow = ShadowMaterial(report);
            Material wood = TestGroundAssets.EnsureMaterial("Steinbruch_Fassholz", new Color(0.45f, 0.3f, 0.16f), report);
            Material iron = TestGroundAssets.EnsureMaterial("Steinbruch_Eisen", new Color(0.35f, 0.36f, 0.38f), report);
            Material sparks = AetherPushEffect.ParticleMaterial(report);

            // Arena: cover blocks (charge stoppers), crane, oil barrels, water channel.
            Transform arena = SliceEnemyBuilder.Child(root.transform, "Arena", Vector3.zero);
            Vector2[] blocks = { new Vector2(-6f, 5f), new Vector2(7f, 4f), new Vector2(-5f, -7f), new Vector2(8f, -6f) };
            for (int i = 0; i < blocks.Length; i++)
            {
                Block(arena, "Steinblock " + (i + 1), At(blocks[i].x, blocks[i].y), new Vector3(1.7f, 1.4f, 1.5f), 17f * i, stone, environmentLayer, true);
            }

            Vector3 cranePosition = At(-10f, -10f);
            Transform crane = CharacterModels.Instantiate(CharacterModels.Crane, arena, "Kran", environmentLayer, report);
            if (crane != null)
            {
                crane.position = cranePosition;
                Vector3 look = center - cranePosition;
                look.y = 0f;
                crane.rotation = Quaternion.LookRotation(look.normalized, Vector3.up);
                BoxCollider foot = crane.gameObject.AddComponent<BoxCollider>();
                foot.center = new Vector3(0f, 0.6f, 0f);
                foot.size = new Vector3(1.8f, 1.2f, 1.8f);
            }

            var barrels = new List<ExplosiveObject>
            {
                ExplosiveBuilder.BuildOilBarrel(arena, "Ölfass 1", "obj.eichental.oelfass_steinbruch_1", At(-9f, 1f), wood, iron, hurtboxLayer,
                    environmentLayer, report),
                ExplosiveBuilder.BuildOilBarrel(arena, "Ölfass 2", "obj.eichental.oelfass_steinbruch_2", At(10f, -2f), wood, iron, hurtboxLayer,
                    environmentLayer, report)
            };

            Transform channel = SliceEnemyBuilder.Child(arena, "Wasserrinne", At(13f, 0f));
            Block(channel, "Rinne West", channel.position + new Vector3(-0.7f, 0f, 0f), new Vector3(0.25f, 0.45f, 11f), 0f, trough, environmentLayer, false);
            Block(channel, "Rinne Ost", channel.position + new Vector3(0.7f, 0f, 0f), new Vector3(0.25f, 0.45f, 11f), 0f, trough, environmentLayer, false);
            GameObject surface = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.DestroyImmediate(surface.GetComponent<Collider>());
            surface.name = "Wasser";
            surface.transform.SetParent(channel, false);
            surface.transform.localPosition = new Vector3(0f, 0.12f, 0f);
            surface.transform.localScale = new Vector3(1.15f, 0.05f, 11f);
            surface.GetComponent<Renderer>().sharedMaterial = water;
            for (int i = 0; i < 3; i++)
            {
                ElementArea wet = ExplosiveBuilder.BuildArea(channel, "Nass " + (i + 1), 1.4f, hurtboxLayer, sparks, report);
                wet.transform.localPosition = new Vector3(0f, 0f, -4f + 4f * i);
                TestGroundFields.SetInt(wet, "kind", (int)ElementAreaKind.Water, report);
            }

            // Falling crane stones with their shadows, fire pots and their burning ground: all off until used.
            var stones = new List<Object>();
            var shadows = new List<Object>();
            for (int i = 0; i < 3; i++)
            {
                GameObject fallen = Block(arena, "Kranstein " + (i + 1), center, new Vector3(1.2f, 1.0f, 1.2f), 25f * i, stone, environmentLayer, true);
                fallen.SetActive(false);
                stones.Add(fallen.transform);
                GameObject disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                Object.DestroyImmediate(disc.GetComponent<Collider>());
                disc.name = "Schatten " + (i + 1);
                disc.transform.SetParent(arena, false);
                disc.transform.position = center;
                disc.transform.localScale = new Vector3(3.2f, 0.01f, 3.2f);
                Renderer discRenderer = disc.GetComponent<Renderer>();
                discRenderer.sharedMaterial = shadow;
                discRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                disc.SetActive(false);
                shadows.Add(disc.transform);
            }

            var pots = new List<Object>();
            var fires = new List<Object>();
            for (int i = 0; i < 2; i++)
            {
                Transform pot = CharacterModels.Instantiate(CharacterModels.FirePot, arena, "Brandtopf " + (i + 1), -1, report);
                if (pot == null)
                {
                    GameObject placeholder = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    Object.DestroyImmediate(placeholder.GetComponent<Collider>());
                    placeholder.name = "Brandtopf " + (i + 1);
                    placeholder.transform.SetParent(arena, false);
                    placeholder.transform.localScale = Vector3.one * 0.25f;
                    pot = placeholder.transform;
                }

                pot.gameObject.SetActive(false);
                pots.Add(pot);
                ElementArea fire = ExplosiveBuilder.BuildArea(arena, "Brandfläche " + (i + 1), 2.5f, hurtboxLayer, sparks, report);
                fire.gameObject.SetActive(false);
                fires.Add(fire);
            }

            // Grimmbart in the middle of the kettle, facing the way in (north).
            Vector3 bossPosition = At(0f, -5f);
            BossController boss = BuildBoss(root.transform, bossPosition, 0f, regionId, enemyLayer, hurtboxLayer, environmentLayer, interactableLayer, report,
                out Transform weaponHand, out Transform horn, out List<GameObject> armour);
            GameObject bossRoot = boss.gameObject;
            var encounter = new Vector4(center.x - HalfEncounter, center.z - HalfEncounter, center.x + HalfEncounter, center.z + HalfEncounter);
            var bounds = new Vector4(center.x - HalfBounds, center.z - HalfBounds, center.x + HalfBounds, center.z + HalfBounds);
            GruftParts.SetVector4(boss, "encounterArea", encounter, report);
            GruftParts.SetVector4(boss, "arenaBounds", bounds, report);

            // The war horn and the four bandits it calls (from the way in).
            var helpers = new List<Object>();
            EnemyTypeDefinition banditType = SliceEnemyAssets.Get(SliceEnemyAssets.BanditType, "normal");
            EnemyTypeDefinition bandit = banditType != null ? MiniSliceProfile.EnemyAtLevel(banditType, 6, report) : null;
            Transform helperGroup = SliceEnemyBuilder.Child(root.transform, "Hornruf", Vector3.zero);
            Vector2[] entries = { new Vector2(-3f, 12f), new Vector2(3f, 12f), new Vector2(-6f, 10f), new Vector2(6f, 10f) };
            for (int i = 0; i < entries.Length && bandit != null; i++)
            {
                EnemyController helper = SliceEnemyBuilder.Build(helperGroup, SliceEnemyAssets.BanditType, "normal", bandit, "Bandit (Hornruf) " + (i + 1),
                    "horn-" + (i + 1), At(entries[i].x, entries[i].y) + new Vector3(0f, 0.05f, 0f), 180f, true, null, materials, enemyLayer, hurtboxLayer,
                    environmentLayer, report);
                TestGroundFields.SetInt(helper, "sightBlockers", solidMask, report);
                helper.gameObject.SetActive(false);
                helpers.Add(helper);
            }

            BossHornCall hornCall = bossRoot.AddComponent<BossHornCall>();
            TestGroundFields.SetReference(hornCall, "boss", boss, report);
            TestGroundFields.SetReference(hornCall, "horn", horn, report);
            TestGroundFields.SetReferences(hornCall, "helpers", helpers.ToArray(), report);
            ParticleSystem blast = SpellVisualsBuilder.Burst(bossRoot.transform, "Hornstoss", new Color(1f, 0.85f, 0.5f), new Color(0.8f, 0.6f, 0.3f, 0.7f), 0.5f,
                1f, 3f, 7f, 0.1f, 0.3f, 60, ParticleSystemShapeType.Cone, 0.3f, report);
            blast.transform.localPosition = new Vector3(0f, 1.8f, 0.3f);
            TestGroundFields.SetReference(hornCall, "blast", blast, report);

            BossCraneDrop craneDrop = bossRoot.AddComponent<BossCraneDrop>();
            TestGroundFields.SetReference(craneDrop, "boss", boss, report);
            TestGroundFields.SetReference(craneDrop, "stoneAttack", GrimmbartAssets.FallingStone, report);
            TestGroundFields.SetReferences(craneDrop, "stones", stones.ToArray(), report);
            TestGroundFields.SetReferences(craneDrop, "shadows", shadows.ToArray(), report);
            GruftParts.SetVector4(craneDrop, "arena",
                new Vector4(center.x - HalfDropArea, center.z - HalfDropArea, center.x + HalfDropArea, center.z + HalfDropArea), report);
            TestGroundFields.SetInt(craneDrop, "groundLayers", solidMask, report);

            BossFirePots firePots = bossRoot.AddComponent<BossFirePots>();
            TestGroundFields.SetReference(firePots, "boss", boss, report);
            TestGroundFields.SetReference(firePots, "throwPoint", weaponHand, report);
            TestGroundFields.SetReferences(firePots, "pots", pots.ToArray(), report);
            TestGroundFields.SetReferences(firePots, "fires", fires.ToArray(), report);
            var puddles = new List<Object>();
            foreach (ExplosiveObject barrel in barrels)
            {
                if (barrel != null && barrel.Area != null)
                {
                    puddles.Add(barrel.Area);
                }
            }

            TestGroundFields.SetReferences(firePots, "oil", puddles.ToArray(), report);

            BossArmorShed shed = bossRoot.AddComponent<BossArmorShed>();
            TestGroundFields.SetReference(shed, "boss", boss, report);
            TestGroundFields.SetReferences(shed, "armour", armour.ToArray(), report);
            ParticleSystem clatter = SpellVisualsBuilder.Burst(bossRoot.transform, "Ruestung faellt", new Color(0.7f, 0.7f, 0.72f), new Color(0.4f, 0.4f, 0.42f, 0.8f),
                0.4f, 0.9f, 2f, 5f, 0.08f, 0.2f, 40, ParticleSystemShapeType.Sphere, 0.6f, report);
            clatter.transform.localPosition = new Vector3(0f, 1.3f, 0f);
            TestGroundFields.SetReference(shed, "clatter", clatter, report);

            BossBarrelKick kick = bossRoot.AddComponent<BossBarrelKick>();
            TestGroundFields.SetReference(kick, "boss", boss, report);
            TestGroundFields.SetReferences(kick, "barrels", barrels.ToArray(), report);

            report.Info("Grimmbarts Steinbruch: Kessel " + (HalfEncounter * 2f).ToString("0") + " m Kampfbereich, 4 Steinblöcke, Kran mit 3 Steinen, 2 Ölfässer, " +
                        "Wasserrinne; Grimmbart mit Kriegshorn (" + helpers.Count + " Banditen), Rüstung (" + armour.Count + " Teile), Brandtöpfe, Fesseln bei 10 %.");
            return boss;
        }

        private static BossController BuildBoss(Transform parent, Vector3 position, float yaw, string regionId, int enemyLayer, int hurtboxLayer,
            int environmentLayer, int interactableLayer, TestGroundReport report, out Transform weaponHand, out Transform horn, out List<GameObject> armour)
        {
            var root = new GameObject("Grimmbart");
            root.transform.SetParent(parent, false);
            root.transform.SetPositionAndRotation(position + new Vector3(0f, 0.05f, 0f), Quaternion.Euler(0f, yaw, 0f));
            if (enemyLayer >= 0)
            {
                root.layer = enemyLayer;
            }

            CharacterController controller = root.AddComponent<CharacterController>();
            controller.height = 2.0f;
            controller.radius = 0.45f;
            controller.center = new Vector3(0f, 1.0f, 0f);
            controller.skinWidth = 0.03f;
            controller.stepOffset = 0.3f;
            controller.minMoveDistance = 0f;

            Transform body = SliceEnemyBuilder.Child(root.transform, "Body", new Vector3(0f, 1.05f, 0f));
            weaponHand = SliceEnemyBuilder.Child(body, "Waffenhand", new Vector3(0.4f, 0.05f, 0.2f));
            Transform offHand = SliceEnemyBuilder.Child(weaponHand, "Stuetzhand", new Vector3(-0.05f, 0.05f, 0.35f));
            Transform model = CharacterModels.Instantiate(CharacterModels.Grimmbart, body, "Modell", root.layer, report);
            Renderer[] flashRenderers = new Renderer[0];
            horn = null;
            armour = new List<GameObject>();
            if (model != null)
            {
                model.localPosition = -body.localPosition;
                foreach (Transform part in model.GetComponentsInChildren<Transform>(true))
                {
                    if (part.name.StartsWith("Ruestung_", StringComparison.Ordinal))
                    {
                        armour.Add(part.gameObject);
                    }
                    else if (part.name == "Kriegshorn")
                    {
                        horn = part;
                    }
                }

                HumanoidPuppet puppet = model.gameObject.AddComponent<HumanoidPuppet>();
                puppet.BindByName(model);
                puppet.SetHandTargets(weaponHand, offHand);
                puppet.SetFallOnDeath(true);
                flashRenderers = model.GetComponentsInChildren<Renderer>(true);
            }

            Transform hammer = CharacterModels.Instantiate(CharacterModels.StoneHammer, weaponHand, "Steinhammer", root.layer, report);
            if (hammer != null)
            {
                hammer.localRotation = Quaternion.Euler(-35f, 0f, 0f);
            }

            EnemyTypeDefinition type = GrimmbartAssets.Type;
            Transform targetPoint = SliceEnemyBuilder.Child(root.transform, "TargetPoint", new Vector3(0f, 1.35f, 0f));
            HitFlash flash = root.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", flashRenderers, report);
            Combatant combatant = SliceEnemyBuilder.AddCombatant(root, type, "1", targetPoint, flash, report);
            TestGroundFields.SetString(combatant, "combatantId", GrimmbartAssets.BossId, report);
            TestGroundFields.SetString(combatant, "typeId", GrimmbartAssets.TypeId, report);
            DamageableComponent damageable = root.GetComponent<DamageableComponent>();
            TestGroundFields.SetString(damageable, "ownerId", GrimmbartAssets.BossId, report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.3f, 0f), new Vector3(0.75f, 1.45f, 0.55f), hurtboxLayer,
                report);
            TestGroundCombatBuilder.AddHurtbox(body, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 0.85f, 0f), new Vector3(0.4f, 0.4f, 0.4f), hurtboxLayer,
                report);
            if (horn != null)
            {
                // GDD 02 11.6: the horn on his belt can be shot off with three ranged hits.
                TestGroundCombatBuilder.AddHurtbox(horn, "Hurtbox_Horn", HitZone.WeakPoint, Vector3.zero, new Vector3(0.28f, 0.34f, 0.22f), hurtboxLayer,
                    report);
            }

            StatusVisualsBuilder.Add(root, 2.0f, 0.45f, report);
            Hitbox hitbox = SliceEnemyBuilder.AddHitbox(root, combatant, hurtboxLayer, report);

            BossController boss = root.AddComponent<BossController>();
            TestGroundFields.SetReference(boss, "definition", GrimmbartAssets.Boss, report);
            TestGroundFields.SetReference(boss, "hitbox", hitbox, report);
            TestGroundFields.SetReference(boss, "hitFlash", flash, report);
            TestGroundFields.SetReference(boss, "body", body, report);
            TestGroundFields.SetReferences(boss, "adds", new Object[0], report);
            TestGroundFields.SetInt(boss, "obstacleLayers", 1 << environmentLayer, report);
            TestGroundFields.SetInt(boss, "beamBlockers", 1 << environmentLayer, report);
            TestGroundFields.SetInt(boss, "chargeStopLayers", 1 << environmentLayer, report);

            EnemyDeathReporter reporter = root.AddComponent<EnemyDeathReporter>();
            TestGroundFields.SetReference(reporter, "combatant", combatant, report);
            TestGroundFields.SetReference(reporter, "definition", type, report);
            TestGroundFields.SetString(reporter, "regionId", regionId, report);

            // "Fesseln" while he kneels.
            Transform bind = SliceEnemyBuilder.Child(root.transform, "Fesseln", new Vector3(0f, 1.0f, 0f));
            if (interactableLayer >= 0)
            {
                bind.gameObject.layer = interactableLayer;
            }

            SphereCollider bindZone = bind.gameObject.AddComponent<SphereCollider>();
            bindZone.isTrigger = true;
            bindZone.radius = 1.6f;
            BossBindInteraction interaction = bind.gameObject.AddComponent<BossBindInteraction>();
            TestGroundFields.SetReference(interaction, "boss", boss, report);

            // "Besiegt bleibt besiegt" (killed or bound).
            DefeatedObjectGate gate = SliceEnemyBuilder.Child(parent, "Besiegt bleibt besiegt", Vector3.zero).gameObject.AddComponent<DefeatedObjectGate>();
            TestGroundFields.SetString(gate, "objectId", GrimmbartAssets.BossId, report);
            TestGroundFields.SetReference(gate, "target", root, report);
            return boss;
        }

        private static GameObject Block(Transform parent, string name, Vector3 groundPoint, Vector3 size, float yaw, Material material, int layer,
            bool stopsCharge)
        {
            GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = name;
            block.layer = layer;
            block.transform.SetParent(parent, true);
            block.transform.SetPositionAndRotation(groundPoint + new Vector3(0f, size.y * 0.5f - 0.05f, 0f), Quaternion.Euler(0f, yaw, 0f));
            block.transform.localScale = size;
            block.GetComponent<Renderer>().sharedMaterial = material;
            if (stopsCharge)
            {
                block.AddComponent<BossChargeStopper>();
            }

            return block;
        }

        private static Material ShadowMaterial(TestGroundReport report)
        {
            Material material = TestGroundAssets.EnsureMaterial("Steinbruch_Schatten", new Color(0.05f, 0.04f, 0.04f), report);
            material.SetColor("_BaseColor", new Color(0.05f, 0.04f, 0.04f, 0.65f));
            material.SetFloat("_Surface", 1f);
            material.SetFloat("_Blend", 0f);
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            material.SetFloat("_ZWrite", 0f);
            material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            UnityEditor.EditorUtility.SetDirty(material);
            return material;
        }
    }
}
