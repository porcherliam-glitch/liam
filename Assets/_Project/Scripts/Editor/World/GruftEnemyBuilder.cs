using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Events;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Enemies of the crypt (GDD 02 11.7): the skeleton warriors of the spawners (block figures of bone and rusty armor, the
    /// elite with tower shield and <see cref="EnemyShieldGuard"/>), switched on by <see cref="ActivateOnState"/> when the gate
    /// puzzle is solved; the boss "Der Wachende Ritter" with <see cref="BossController"/>, its two adds (off until phase 2),
    /// <see cref="DefeatedObjectGate"/> ("besiegt bleibt besiegt") and the arena beam (<see cref="ArenaBeamEmitter"/>). The boss bar is
    /// shown by the HUD (<c>BossBarView</c>); the IMGUI <see cref="BossBarOverlay"/> is no longer placed.
    /// </summary>
    public static class GruftEnemyBuilder
    {
        private const float SkeletonHeight = 1.8f;
        private const float SkeletonRadius = 0.35f;

        /// <summary>Builds spawners and boss.</summary>
        /// <param name="ctx">Context (objects built: mirrors, cracks).</param>
        /// <param name="assets">Enemy data.</param>
        /// <returns>The spawner of the first group (for the combat overlay), or null.</returns>
        public static EnemySpawner Build(GruftContext ctx, GruftAssets assets)
        {
            EnemySpawner first = null;
            Transform enemies = GruftParts.Empty(ctx.Root, "Gegner", Vector3.zero);
            foreach (DungeonSpawner spawner in ctx.Layout.Spawners)
            {
                EnemySpawner built = BuildSpawner(ctx, enemies, spawner, assets);
                if (first == null)
                {
                    first = built;
                }
            }

            if (ctx.Layout.BossArena != null)
            {
                BuildBoss(ctx, enemies, ctx.Layout.BossArena, assets);
            }

            return first;
        }

        private static EnemySpawner BuildSpawner(GruftContext ctx, Transform parent, DungeonSpawner spawner, GruftAssets assets)
        {
            Transform group = GruftParts.Empty(parent, string.IsNullOrEmpty(spawner.Name) ? spawner.Id : spawner.Name, Vector3.zero);
            var controllers = new List<Object>();
            int elites = 0;
            foreach (DungeonEnemy enemy in spawner.Enemies)
            {
                bool elite = enemy.Variant == DungeonEnemy.Elite;
                EnemyTypeDefinition definition = elite ? assets.SkeletonElite : assets.Skeleton;
                Vector3 position = ctx.Position(enemy.X, enemy.Z, float.NaN, 0f);
                var patrol = new List<Transform>();
                for (int i = 0; i < enemy.Patrol.Count; i++)
                {
                    Transform point = GruftParts.Empty(group, "Patrouille " + enemy.Number + "." + (i + 1), Vector3.zero);
                    point.position = ctx.Position(enemy.Patrol[i].X, enemy.Patrol[i].Z, float.NaN, 0f);
                    patrol.Add(point);
                }

                string name = (elite ? "Skelett-Krieger Elite " : "Skelett-Krieger ") + enemy.Number;
                EnemyController controller = BuildSkeleton(ctx, group, name, enemy.Number, definition, position, enemy.Yaw, enemy.Guard && patrol.Count == 0,
                    patrol.ToArray(), enemy.TowerShield, false);
                controllers.Add(controller);
                if (elite)
                {
                    elites++;
                }
            }

            EnemySpawner logic = group.gameObject.AddComponent<EnemySpawner>();
            TestGroundFields.SetReferences(logic, "enemies", controllers.ToArray(), ctx.Report);
            if (spawner.Activation.Type == DungeonTrigger.Puzzle || spawner.Activation.Type == DungeonTrigger.ObjectState)
            {
                Transform activator = GruftParts.Empty(parent, "Aktivierung " + spawner.Id, Vector3.zero);
                ActivateOnState activate = activator.gameObject.AddComponent<ActivateOnState>();
                TestGroundFields.SetString(activate, "watchedId", spawner.Activation.Id, ctx.Report);
                TestGroundFields.SetInt(activate, "activeState", spawner.Activation.State, ctx.Report);
                TestGroundFields.SetReferences(activate, "targets", new Object[] { group.gameObject }, ctx.Report);
            }

            ctx.Report.Info("Spawner " + spawner.Id + ": " + controllers.Count + " Skelett-Krieger (" + elites + " Elite mit Turmschild), aktiv ab " +
                            spawner.Activation + ".");
            return logic;
        }

        private static EnemyController BuildSkeleton(GruftContext ctx, Transform parent, string name, string number, EnemyTypeDefinition definition,
            Vector3 position, float yaw, bool guard, Transform[] patrol, bool towerShield, bool startInactive)
        {
            GameObject root = CreateFigure(ctx, parent, name, position, yaw, 1f, false, towerShield, out Transform body, out Transform shield,
                out Renderer[] flashRenderers);
            HitFlash flash = root.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", flashRenderers, ctx.Report);
            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", definition != null ? definition.MaxHealth : 100f, ctx.Report);
            TestGroundFields.SetBool(damageable, "regenerate", false, ctx.Report);
            TestGroundFields.SetString(damageable, "ownerId", GruftPaths.SkeletonTypeId + "#" + number, ctx.Report);
            Combatant combatant = AddCombatant(ctx, root, damageable, flash, 1f);
            AddHurtboxes(ctx, root.transform, body, 1f);
            Hitbox hitbox = AddHitbox(ctx, root, combatant);

            EnemyController enemy = root.AddComponent<EnemyController>();
            TestGroundFields.SetReference(enemy, "definition", definition, ctx.Report);
            TestGroundFields.SetString(enemy, "instanceNumber", number, ctx.Report);
            TestGroundFields.SetBool(enemy, "guard", guard, ctx.Report);
            TestGroundFields.SetReferences(enemy, "patrolPoints", patrol, ctx.Report);
            TestGroundFields.SetReference(enemy, "hitbox", hitbox, ctx.Report);
            TestGroundFields.SetReference(enemy, "hitFlash", flash, ctx.Report);
            TestGroundFields.SetReference(enemy, "body", body, ctx.Report);
            TestGroundFields.SetInt(enemy, "obstacleLayers", 1 << ctx.EnvironmentLayer, ctx.Report);
            TestGroundFields.SetInt(enemy, "sightBlockers", 1 << ctx.EnvironmentLayer, ctx.Report);
            if (towerShield)
            {
                EnemyShieldGuard guardComponent = root.AddComponent<EnemyShieldGuard>();
                TestGroundFields.SetReference(guardComponent, "shieldVisual", shield, ctx.Report);
            }

            EnemyDeathReporter reporter = root.AddComponent<EnemyDeathReporter>();
            TestGroundFields.SetReference(reporter, "combatant", combatant, ctx.Report);
            TestGroundFields.SetReference(reporter, "definition", definition, ctx.Report);
            TestGroundFields.SetString(reporter, "regionId", ctx.Layout.RegionId, ctx.Report);
            if (startInactive)
            {
                root.SetActive(false);
            }

            return enemy;
        }

        private static void BuildBoss(GruftContext ctx, Transform parent, DungeonBossArena arena, GruftAssets assets)
        {
            Transform group = GruftParts.Empty(parent, "Boss " + arena.Name, Vector3.zero);
            Vector3 position = ctx.Position(arena.X, arena.Z, float.NaN, 0f);
            const float scale = 1.22f;
            GameObject root = CreateFigure(ctx, group, arena.Name, position, arena.Yaw, scale, true, true, out Transform body, out Transform shield,
                out Renderer[] flashRenderers);
            HitFlash flash = root.AddComponent<HitFlash>();
            TestGroundFields.SetReferences(flash, "renderers", flashRenderers, ctx.Report);
            EnemyTypeDefinition baseType = assets.SkeletonChampion;
            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", baseType != null ? baseType.MaxHealth : 1000f, ctx.Report);
            TestGroundFields.SetBool(damageable, "regenerate", false, ctx.Report);
            TestGroundFields.SetString(damageable, "ownerId", arena.BossId, ctx.Report);
            Combatant combatant = AddCombatant(ctx, root, damageable, flash, scale);
            TestGroundFields.SetString(combatant, "combatantId", arena.BossId, ctx.Report);
            TestGroundFields.SetString(combatant, "typeId", arena.EnemyType, ctx.Report);
            AddHurtboxes(ctx, root.transform, body, scale);
            Hitbox hitbox = AddHitbox(ctx, root, combatant);

            Transform adds = GruftParts.Empty(group, "Ruf des Ritters", Vector3.zero);
            var addControllers = new List<Object>();
            foreach (DungeonEnemy add in arena.Adds)
            {
                Vector3 addPosition = ctx.Position(add.X, add.Z, float.NaN, 0f);
                addControllers.Add(BuildSkeleton(ctx, adds, "Gerufener Skelett-Krieger " + add.Number, add.Number, assets.Skeleton, addPosition, add.Yaw,
                    false, new Transform[0], false, true));
            }

            RotatableMirror mirror = ctx.Get<RotatableMirror>(arena.Mirror);
            GameObject source = ctx.Get(arena.BeamSource);
            BossController boss = root.AddComponent<BossController>();
            TestGroundFields.SetReference(boss, "definition", assets.Boss, ctx.Report);
            DungeonRect area = arena.EncounterArea;
            GruftParts.SetVector4(boss, "encounterArea", new Vector4(area.X, area.Z, area.MaxX, area.MaxZ), ctx.Report);
            DungeonRoom arenaRoom = ctx.Layout.FindRoom(arena.Room);
            DungeonRect bounds = arenaRoom != null ? arenaRoom.Bounds : area;
            GruftParts.SetVector4(boss, "arenaBounds", new Vector4(bounds.X, bounds.Z, bounds.MaxX, bounds.MaxZ), ctx.Report);
            TestGroundFields.SetReference(boss, "hitbox", hitbox, ctx.Report);
            TestGroundFields.SetReference(boss, "hitFlash", flash, ctx.Report);
            TestGroundFields.SetReference(boss, "body", body, ctx.Report);
            TestGroundFields.SetReference(boss, "shield", shield, ctx.Report);
            TestGroundFields.SetReferences(boss, "adds", addControllers.ToArray(), ctx.Report);
            TestGroundFields.SetReference(boss, "beamMirror", mirror != null ? mirror.Pivot : null, ctx.Report);
            TestGroundFields.SetReference(boss, "beamSource", source != null ? source.transform : null, ctx.Report);
            TestGroundFields.SetInt(boss, "beamBlockers", 1 << ctx.EnvironmentLayer, ctx.Report);
            TestGroundFields.SetInt(boss, "obstacleLayers", 1 << ctx.EnvironmentLayer, ctx.Report);

            EnemyDeathReporter reporter = root.AddComponent<EnemyDeathReporter>();
            TestGroundFields.SetReference(reporter, "combatant", combatant, ctx.Report);
            TestGroundFields.SetReference(reporter, "definition", baseType, ctx.Report);
            TestGroundFields.SetString(reporter, "regionId", ctx.Layout.RegionId, ctx.Report);

            DefeatedObjectGate gate = GruftParts.Empty(group, "Besiegt bleibt besiegt", Vector3.zero).gameObject.AddComponent<DefeatedObjectGate>();
            TestGroundFields.SetString(gate, "objectId", arena.BossId, ctx.Report);
            TestGroundFields.SetReference(gate, "target", root, ctx.Report);

            Transform beamRoot = GruftParts.Empty(group, "Aetherstrahl Arena", Vector3.zero);
            AetherBeamView beam = GruftObjectBuilder.CreateBeam(ctx, beamRoot, "Strahl");
            ArenaBeamEmitter emitter = beamRoot.gameObject.AddComponent<ArenaBeamEmitter>();
            TestGroundFields.SetString(emitter, "bossId", arena.BossId, ctx.Report);
            TestGroundFields.SetInt(emitter, "fromPhase", arena.BeamFromPhase, ctx.Report);
            TestGroundFields.SetReference(emitter, "source", source != null ? source.transform : null, ctx.Report);
            TestGroundFields.SetReference(emitter, "mirror", mirror, ctx.Report);
            TestGroundFields.SetReference(emitter, "beam", beam, ctx.Report);
            int blocking = (1 << ctx.EnvironmentLayer) | (ctx.EnemyLayer >= 0 ? 1 << ctx.EnemyLayer : 0);
            TestGroundFields.SetInt(emitter, "blockingLayers", blocking, ctx.Report);

            ctx.Register(arena.BossId, root);
            ctx.Report.Info("Boss „" + arena.Name + "“: Stufe " + (baseType != null ? baseType.Level : 0) + ", " +
                            (baseType != null ? baseType.MaxHealth.ToString("0") : "?") + " LP, Phase 2 ab 50 % mit " + arena.Adds.Count +
                            " Helfern und Aether-Strahl (Spiegel " + arena.Mirror + "), Kampfbereich " + area + ".");
        }

        private static GameObject CreateFigure(GruftContext ctx, Transform parent, string name, Vector3 position, float yaw, float scale, bool knight,
            bool towerShield, out Transform body, out Transform shield, out Renderer[] flashRenderers)
        {
            GruftMaterials m = ctx.Materials;
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
            if (ctx.EnemyLayer >= 0)
            {
                root.layer = ctx.EnemyLayer;
            }

            CharacterController controller = root.AddComponent<CharacterController>();
            controller.height = SkeletonHeight * scale;
            controller.radius = SkeletonRadius * scale;
            controller.center = new Vector3(0f, SkeletonHeight * scale * 0.5f, 0f);
            controller.skinWidth = 0.03f;
            controller.stepOffset = 0.3f;
            controller.minMoveDistance = 0f;

            int layer = root.layer;
            body = GruftParts.Empty(root.transform, "Body", new Vector3(0f, 0.95f * scale, 0f));
            Transform model = CharacterModels.Instantiate(knight ? CharacterModels.Knight : CharacterModels.Skeleton, body, "Modell", layer, ctx.Report);
            if (model != null)
            {
                return DressModel(ctx, root, body, model, scale, knight, towerShield, out shield, out flashRenderers);
            }

            Material torsoMaterial = knight ? m.KnightArmor : m.Armor;
            GameObject torso = GruftParts.Part(body, "Rumpf", PrimitiveType.Cube, new Vector3(0f, 0.32f, 0f) * scale, new Vector3(0.5f, 0.62f, 0.28f) * scale,
                torsoMaterial, layer, false);
            GameObject head = GruftParts.Part(body, "Kopf", PrimitiveType.Sphere, new Vector3(0f, 0.82f, 0f) * scale, new Vector3(0.3f, 0.32f, 0.3f) * scale,
                m.Bone, layer, false);
            if (knight)
            {
                GruftParts.Part(body, "Helm", PrimitiveType.Cylinder, new Vector3(0f, 0.88f, 0f) * scale, new Vector3(0.36f, 0.2f, 0.36f) * scale,
                    m.KnightArmor, layer, false);
                GruftParts.Part(body, "Wappenrock", PrimitiveType.Cube, new Vector3(0f, 0.05f, 0.15f) * scale, new Vector3(0.42f, 0.8f, 0.03f) * scale,
                    m.Cloth, layer, false);
            }

            GruftParts.Part(body, "Arm rechts", PrimitiveType.Cube, new Vector3(0.33f, 0.3f, 0.05f) * scale, new Vector3(0.12f, 0.6f, 0.12f) * scale, m.Bone,
                layer, false);
            GruftParts.Part(body, "Arm links", PrimitiveType.Cube, new Vector3(-0.33f, 0.3f, 0.05f) * scale, new Vector3(0.12f, 0.6f, 0.12f) * scale, m.Bone,
                layer, false);
            GruftParts.Part(body, "Bein rechts", PrimitiveType.Cube, new Vector3(0.12f, -0.48f, 0f) * scale, new Vector3(0.14f, 0.92f, 0.14f) * scale, m.Bone,
                layer, false);
            GruftParts.Part(body, "Bein links", PrimitiveType.Cube, new Vector3(-0.12f, -0.48f, 0f) * scale, new Vector3(0.14f, 0.92f, 0.14f) * scale, m.Bone,
                layer, false);
            Transform swordHand = GruftParts.Empty(body, "Schwerthand", new Vector3(0.36f, 0.05f, 0.15f) * scale);
            GruftParts.Part(swordHand, "Klinge", PrimitiveType.Cube, new Vector3(0f, 0f, 0.55f) * scale, new Vector3(0.06f, 0.1f, 1.0f) * scale, m.Iron, layer,
                false);
            GruftParts.Part(swordHand, "Parierstange", PrimitiveType.Cube, new Vector3(0f, 0f, 0.05f) * scale, new Vector3(0.26f, 0.05f, 0.05f) * scale,
                m.Iron, layer, false);
            shield = null;
            if (towerShield)
            {
                shield = GruftParts.Empty(body, "Schildarm", new Vector3(-0.36f, 0.15f, 0.25f) * scale);
                GruftParts.Part(shield, "Turmschild", PrimitiveType.Cube, new Vector3(0f, 0f, 0.05f) * scale, new Vector3(0.75f, 1.35f, 0.08f) * scale,
                    knight ? m.KnightArmor : m.Wood, layer, false);
                GruftParts.Part(shield, "Schildbuckel", PrimitiveType.Sphere, new Vector3(0f, 0.1f, 0.1f) * scale, new Vector3(0.2f, 0.2f, 0.1f) * scale,
                    m.Iron, layer, false);
            }

            Transform targetPoint = GruftParts.Empty(root.transform, "TargetPoint", new Vector3(0f, 1.25f * scale, 0f));
            targetPoint.gameObject.layer = layer;
            flashRenderers = new[] { torso.GetComponent<Renderer>(), head.GetComponent<Renderer>() };
            return root;
        }

        /// <summary>
        /// Blender model of a skeleton or the knight under the body pivot (rearing up and falling over stay with the pivot): crypt
        /// materials by slot name, sword and tower shield models in the hands, <see cref="HumanoidPuppet"/> with the hands on
        /// sword and shield.
        /// </summary>
        private static GameObject DressModel(GruftContext ctx, GameObject root, Transform body, Transform model, float scale, bool knight, bool towerShield,
            out Transform shield, out Renderer[] flashRenderers)
        {
            GruftMaterials m = ctx.Materials;
            int layer = root.layer;
            model.localPosition = -body.localPosition;
            model.localScale = Vector3.one * scale;
            Recolour(model, m, knight);

            Transform swordHand = GruftParts.Empty(body, "Schwerthand", new Vector3(0.36f, 0.05f, 0.15f) * scale);
            Transform sword = CharacterModels.Instantiate(CharacterModels.Sword, swordHand, "Schwert", layer, ctx.Report);
            if (sword != null)
            {
                sword.localScale = Vector3.one * scale;
                sword.localRotation = Quaternion.Euler(-30f, 0f, 0f);
            }

            shield = null;
            if (towerShield)
            {
                shield = GruftParts.Empty(body, "Schildarm", new Vector3(-0.36f, 0.15f, 0.25f) * scale);
                Transform tower = CharacterModels.Instantiate(CharacterModels.TowerShield, shield, "Turmschild", layer, ctx.Report);
                if (tower != null)
                {
                    tower.localScale = Vector3.one * scale;
                    Recolour(tower, m, knight);
                }
            }

            HumanoidPuppet puppet = model.gameObject.AddComponent<HumanoidPuppet>();
            puppet.BindByName(model);
            puppet.SetHandTargets(swordHand, shield);
            puppet.SetFallOnDeath(false);

            Transform targetPoint = GruftParts.Empty(root.transform, "TargetPoint", new Vector3(0f, 1.25f * scale, 0f));
            targetPoint.gameObject.layer = layer;
            flashRenderers = model.GetComponentsInChildren<Renderer>();
            return root;
        }

        private static void Recolour(Transform model, GruftMaterials m, bool knight)
        {
            foreach (Renderer part in model.GetComponentsInChildren<Renderer>(true))
            {
                Material[] slots = part.sharedMaterials;
                for (int i = 0; i < slots.Length; i++)
                {
                    switch (slots[i] != null ? slots[i].name : string.Empty)
                    {
                        case "Gruft_Knochen":
                            slots[i] = m.Bone;
                            break;
                        case "Gruft_Ruestung":
                            slots[i] = m.Armor;
                            break;
                        case "Gruft_Ritter":
                            slots[i] = m.KnightArmor;
                            break;
                        case "Gruft_Stoff":
                            slots[i] = m.Cloth;
                            break;
                        case "Gruft_Eisen":
                            slots[i] = m.Iron;
                            break;
                        case "Gruft_Wappen":
                            slots[i] = m.Gold;
                            break;
                        case "Gruft_Augen_Leuchten":
                            slots[i] = m.AetherGlow;
                            break;
                        case "Gruft_Schild":
                            slots[i] = knight ? m.KnightArmor : m.Wood;
                            break;
                    }
                }

                part.sharedMaterials = slots;
            }
        }

        private static Combatant AddCombatant(GruftContext ctx, GameObject root, DamageableComponent damageable, HitFlash flash, float scale)
        {
            Combatant combatant = root.AddComponent<Combatant>();
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Enemy, ctx.Report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, ctx.Report);
            TestGroundFields.SetReference(combatant, "targetPoint", root.transform.Find("TargetPoint"), ctx.Report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, ctx.Report);
            return combatant;
        }

        private static void AddHurtboxes(GruftContext ctx, Transform root, Transform body, float scale)
        {
            AddHurtbox(ctx, body, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.05f, 0f) * scale, new Vector3(0.6f, 1.4f, 0.45f) * scale);
            AddHurtbox(ctx, body, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 0.82f, 0f) * scale, new Vector3(0.36f, 0.36f, 0.36f) * scale);
            AddHurtbox(ctx, root, "Hurtbox_Beine", HitZone.Body, new Vector3(0f, 0.45f, 0f) * scale, new Vector3(0.45f, 0.9f, 0.35f) * scale);
        }

        private static void AddHurtbox(GruftContext ctx, Transform parent, string name, HitZone zone, Vector3 localCenter, Vector3 size)
        {
            Transform zoneObject = GruftParts.Empty(parent, name, localCenter);
            if (ctx.HurtboxLayer >= 0)
            {
                zoneObject.gameObject.layer = ctx.HurtboxLayer;
            }

            BoxCollider box = zoneObject.gameObject.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.size = size;
            Hurtbox hurtbox = zoneObject.gameObject.AddComponent<Hurtbox>();
            TestGroundFields.SetInt(hurtbox, "zone", (int)zone, ctx.Report);
            Combatant owner = parent.GetComponentInParent<Combatant>();
            if (owner != null)
            {
                TestGroundFields.SetReference(hurtbox, "owner", owner, ctx.Report);
            }
        }

        private static Hitbox AddHitbox(GruftContext ctx, GameObject root, Combatant combatant)
        {
            Hitbox hitbox = root.AddComponent<Hitbox>();
            TestGroundFields.SetReference(hitbox, "owner", combatant, ctx.Report);
            TestGroundFields.SetInt(hitbox, "hurtboxLayers", ctx.HurtboxLayer >= 0 ? 1 << ctx.HurtboxLayer : ~0, ctx.Report);
            return hitbox;
        }
    }
}
