using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The enemy types of the vertical slice beside wolves and skeletons (GDD 01 11.4): Bandit-Schläger (normal and elite
    /// "Anführer"), Bandit-Armbrustschütze (ranged), Rissling (normal, elite and the champion of the prologue) and the elite
    /// grey wolf "Rudelführer". Variants are data overrides of the same type (GDD 01 11.2: elite level +2, health ×2, damage
    /// ×1.3, poise ×1.5, one attack more and a shorter opening after a parry; champion health ×4, damage ×1.5, poise ×2). The
    /// values are written on every run (they follow the GDD here); the levels per area come from the spawners
    /// (<see cref="MiniSliceProfile.EnemyAtLevel"/>).
    /// </summary>
    public static class SliceEnemyAssets
    {
        /// <summary>Bandit-Schläger.</summary>
        public const string BanditType = "enemy.bandit.schlaeger";

        /// <summary>Bandit-Armbrustschütze.</summary>
        public const string CrossbowType = "enemy.bandit.armbrustschuetze";

        /// <summary>Rissling.</summary>
        public const string RisslingType = "enemy.rissbrut.rissling";

        /// <summary>Grey wolf.</summary>
        public const string WolfType = "enemy.wolf.grauwolf";

        private static readonly Dictionary<string, EnemyTypeDefinition> Types = new Dictionary<string, EnemyTypeDefinition>();

        /// <summary>The base definition of a type and variant (after <see cref="EnsureAll"/>), or null.</summary>
        /// <param name="typeId">Enemy type id.</param>
        /// <param name="variant">Variant id.</param>
        public static EnemyTypeDefinition Get(string typeId, string variant)
        {
            return Types.TryGetValue(typeId + "|" + variant, out EnemyTypeDefinition type) ? type : null;
        }

        /// <summary>Key of Glutfang's own type in <see cref="Get"/> (an elite Aether wolf, not a layout variant).</summary>
        public const string GlutfangVariant = "glutfang";

        /// <summary>Level offset of a variant (GDD 01 11.2: elite +2, champion +3).</summary>
        /// <param name="variant">Variant id.</param>
        public static int LevelOffset(string variant)
        {
            return variant == "elite" ? 2 : variant == "champion" ? 3 : 0;
        }

        /// <summary>Creates or updates every type of this list.</summary>
        /// <param name="wolf">The grey wolf of the combat assets (its attacks are reused by the pack leader).</param>
        /// <param name="aetherWolf">The Aether wolf.</param>
        /// <param name="report">Protocol.</param>
        public static void EnsureAll(EnemyTypeDefinition wolf, EnemyTypeDefinition aetherWolf, TestGroundReport report)
        {
            Types.Clear();
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.EnemyFolder, report))
            {
                return;
            }

            Register(WolfType, "normal", wolf);
            Register(WolfType, "aether_verderbt", aetherWolf);

            // Bandit-Schläger (GDD 01 11.4: Nahkämpfer, teaches parrying against clearly announced blows).
            AttackDefinition swing = TestGroundCombatAssets.EnsureAttack("Bandit_Hieb", Melee("attack.bandit.hieb", 0.55f, 1f, 1f, 0.4f, 0.6f), report);
            AttackDefinition smash = TestGroundCombatAssets.EnsureAttack("Bandit_Rundschlag", Melee("attack.bandit.rundschlag", 0.85f, 1.5f, 1.8f, 1.2f, 0.4f),
                report);
            AttackDefinition kick = TestGroundCombatAssets.EnsureAttack("Bandit_Tritt", Melee("attack.bandit.tritt", 0.4f, 0.6f, 2.2f, 1.6f, 0.2f), report);
            EnemyTypeDefinition bandit = Ensure("Bandit_Schlaeger", BanditType, "normal", "Bandit-Schläger", report, so =>
            {
                Body(so, EnemyKind.Humanoid, DamageType.Blunt, 85f, 22f, 20f, 35f, 14f, report);
                Moves(so, 1.8f, 5.2f, 2.4f, 2.5f, 5f, 0.15f, 1.2f, report);
                Attacks(so, report, (swing, 0f, 2.3f, 30f, 1.4f, 3f), (smash, 0f, 2.4f, 25f, 3.5f, 1.5f));
                Resist(so, report, (DamageType.Slash, -0.1f));
            });
            Register(BanditType, "normal", bandit);
            EnemyTypeDefinition leader = Ensure("Bandit_Anfuehrer", BanditType, "elite", "Banditenanführer", report, so =>
            {
                Body(so, EnemyKind.Humanoid, DamageType.Blunt, 85f, 22f, 28f, 35f, 18f, report);
                Elite(so, 2f, 1.3f, 1.5f, 50f, report);
                Moves(so, 1.8f, 5.4f, 2.4f, 2.5f, 5f, 0f, 1.3f, report);
                Attacks(so, report, (swing, 0f, 2.3f, 30f, 1.2f, 3f), (smash, 0f, 2.4f, 25f, 3f, 1.5f), (kick, 0f, 1.8f, 30f, 4f, 1f));
                Resist(so, report, (DamageType.Slash, -0.1f));
            });
            Register(BanditType, "elite", leader);

            // Bandit-Armbrustschütze (Fernkämpfer: keeps 10–16 m, shoots bolts; a butt stroke if you come too close).
            AttackDefinition shot = TestGroundCombatAssets.EnsureAttack("Armbrust_Schuss", Bolt(), report);
            AttackDefinition butt = TestGroundCombatAssets.EnsureAttack("Armbrust_Kolbenstoss", Melee("attack.armbrust.kolbenstoss", 0.45f, 0.6f, 1.2f, 1.2f, 0.2f),
                report);
            EnemyTypeDefinition crossbow = Ensure("Bandit_Armbrustschuetze", CrossbowType, "normal", "Bandit-Armbrustschütze", report, so =>
            {
                Body(so, EnemyKind.Humanoid, DamageType.Stab, 60f, 20f, 12f, 25f, 10f, report);
                Moves(so, 1.8f, 5f, 2.2f, 10f, 16f, 0.2f, 1.3f, report);
                TestGroundSerialized.Set(so, "tokenKind", (int)TokenKind.Ranged, report);
                TestGroundSerialized.Set(so, "sightRange", 30f, report);
                Attacks(so, report, (shot, 4f, 24f, 12f, 2.6f, 4f), (butt, 0f, 1.8f, 40f, 3f, 1f));
            });
            Register(CrossbowType, "normal", crossbow);

            // Rissling (Hinterhalt, Rissbrut: Aether damage, +5 corruption per hit, springs out of crevices).
            AttackDefinition claw = TestGroundCombatAssets.EnsureAttack("Rissling_Klaue", Melee("attack.rissling.klaue", 0.35f, 0.8f, 0.8f, 0.3f, 0.6f, 0.6f, 0.9f),
                report);
            AttackDefinition leap = TestGroundCombatAssets.EnsureAttack("Rissling_Sprung", Leap(), report);
            AttackDefinition burst = TestGroundCombatAssets.EnsureAttack("Rissling_Splitterstoss", Melee("attack.rissling.splitterstoss", 0.7f, 1.4f, 1.6f, 1.4f, 0.3f,
                0.6f, 1.6f), report);
            EnemyTypeDefinition rissling = Ensure("Rissling", RisslingType, "normal", "Rissling", report, so =>
            {
                Body(so, EnemyKind.Beast, DamageType.Slash, 40f, 18f, 8f, 18f, 10f, report);
                Moves(so, 2.2f, 6.5f, 3f, 2.5f, 5f, 0f, 1.3f, report);
                TestGroundSerialized.Set(so, "aetherDamageShare", 0.4f, report);
                Attacks(so, report, (claw, 0f, 1.8f, 35f, 1.0f, 3f), (leap, 2.5f, 5.5f, 25f, 3.5f, 2f));
                Resist(so, report, (DamageType.Aether, 0.5f), (DamageType.Fire, -0.25f));
            });
            Register(RisslingType, "normal", rissling);
            EnemyTypeDefinition risslingElite = Ensure("Rissling_Elite", RisslingType, "elite", "Rissling-Lauerer", report, so =>
            {
                Body(so, EnemyKind.Beast, DamageType.Slash, 40f, 18f, 10f, 18f, 12f, report);
                Elite(so, 2f, 1.3f, 1.5f, 50f, report);
                Moves(so, 2.2f, 6.8f, 3f, 2.5f, 5f, 0f, 1.4f, report);
                TestGroundSerialized.Set(so, "aetherDamageShare", 0.4f, report);
                Attacks(so, report, (claw, 0f, 1.8f, 35f, 0.9f, 3f), (leap, 2.5f, 5.5f, 25f, 3f, 2f), (burst, 0f, 2.2f, 60f, 4f, 1f));
                Resist(so, report, (DamageType.Aether, 0.5f), (DamageType.Fire, -0.25f));
            });
            Register(RisslingType, "elite", risslingElite);
            EnemyTypeDefinition rissbrut = Ensure("Rissling_Champion", RisslingType, "champion", "Rissbrut", report, so =>
            {
                Body(so, EnemyKind.Beast, DamageType.Slash, 40f, 18f, 14f, 18f, 16f, report);
                Elite(so, 4f, 1.5f, 2f, 100f, report);
                Moves(so, 2f, 6f, 2.6f, 3f, 6f, 0f, 1.4f, report);
                TestGroundSerialized.Set(so, "aetherDamageShare", 0.5f, report);
                TestGroundSerialized.Set(so, "hasCrystalCore", true, report);
                Attacks(so, report, (claw, 0f, 2.2f, 40f, 0.9f, 3f), (leap, 2.5f, 6f, 25f, 3f, 2f), (burst, 0f, 2.6f, 70f, 3.5f, 1.5f));
                Resist(so, report, (DamageType.Aether, 0.5f), (DamageType.Fire, -0.25f));
            });
            Register(RisslingType, "champion", rissbrut);

            // Rudelführer (elite grey wolf, GDD 01 11.4): the wolf's attacks, one more pounce, shorter opening after a parry.
            if (wolf != null)
            {
                AttackDefinition bite = AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Wolf_Biss.asset");
                AttackDefinition snap = AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Wolf_Schnappen.asset");
                AttackDefinition pounce = AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Wolf_Sprungangriff.asset");
                EnemyTypeDefinition packLeader = Ensure("Grauwolf_Rudelfuehrer", WolfType, "elite", "Rudelführer", report, so =>
                {
                    Body(so, EnemyKind.Beast, DamageType.Stab, 70f, 25f, 15f, 30f, 12f, report);
                    Elite(so, 2f, 1.3f, 1.5f, 50f, report);
                    Moves(so, 1.8f, 6.4f, 2.8f, 4f, 7f, 0.15f, 1.6f, report);
                    Attacks(so, report, (bite, 0f, 2.2f, 30f, 1.4f, 3f), (snap, 0f, 1.8f, 30f, 1.0f, 2f), (pounce, 3f, 6f, 25f, 3f, 2.5f));
                    Resist(so, report, (DamageType.Fire, -0.5f));
                });
                Register(WolfType, "elite", packLeader);

                // Glutfang (GDD 01 11.4 / GDD 02 11.2): elite grey wolf, Aether-corrupted and grown into the splinter – crystal core,
                // a third more Aether in its bite, no fear of fire. Named boss: health ×3 instead of the elite ×2.
                EnemyTypeDefinition glutfang = Ensure("Grauwolf_Glutfang", WolfType, "elite", "Glutfang", report, so =>
                {
                    Body(so, EnemyKind.Beast, DamageType.Stab, 70f, 25f, 15f, 30f, 14f, report);
                    Elite(so, 3f, 1.3f, 1.6f, 60f, report);
                    Moves(so, 1.8f, 6.8f, 2.8f, 4f, 7f, 0f, 1.6f, report);
                    TestGroundSerialized.Set(so, "aetherDamageShare", 0.35f, report);
                    TestGroundSerialized.Set(so, "hasCrystalCore", true, report);
                    TestGroundSerialized.Set(so, "fleeHealthFraction", 0f, report);
                    Attacks(so, report, (bite, 0f, 2.4f, 30f, 1.3f, 3f), (snap, 0f, 1.9f, 30f, 0.9f, 2f), (pounce, 3f, 7f, 25f, 2.6f, 3f));
                    Resist(so, report, (DamageType.Aether, 0.5f), (DamageType.Fire, 0.25f));
                });
                Register(WolfType, GlutfangVariant, glutfang);
            }

            report.Info("Gegnertypen (GDD 01, 11.4): Grauwolf (normal, Rudelführer, Aether), Bandit-Schläger (normal, Anführer), Bandit-Armbrustschütze, " +
                        "Rissling (normal, Lauerer, Rissbrut-Champion), Skelett-Krieger (Gruft).");
        }

        private static void Register(string typeId, string variant, EnemyTypeDefinition type)
        {
            if (type != null)
            {
                Types[typeId + "|" + variant] = type;
            }
        }

        private static EnemyTypeDefinition Ensure(string file, string typeId, string variant, string name, TestGroundReport report,
            System.Action<SerializedObject> fill)
        {
            var type = TestGroundSerialized.EnsureAsset<EnemyTypeDefinition>(TestGroundPaths.EnemyFolder + "/" + file + ".asset", report, null);
            if (type == null)
            {
                return null;
            }

            var so = new SerializedObject(type);
            TestGroundSerialized.Set(so, "enemyTypeId", typeId, report);
            TestGroundSerialized.Set(so, "variantId", variant, report);
            TestGroundSerialized.Set(so, "displayName", name, report);
            TestGroundSerialized.Set(so, "lootTableId", string.Empty, report);
            TestGroundSerialized.Set(so, "healthVariantFactor", 1f, report);
            TestGroundSerialized.Set(so, "damageVariantFactor", 1f, report);
            TestGroundSerialized.Set(so, "poiseVariantFactor", 1f, report);
            TestGroundSerialized.Set(so, "statusResistance", 0f, report);
            TestGroundSerialized.Set(so, "tokenCost", 1, report);
            TestGroundSerialized.Set(so, "tokenKind", (int)TokenKind.Melee, report);
            TestGroundSerialized.Set(so, "aetherDamageShare", 0f, report);
            TestGroundSerialized.Set(so, "hasCrystalCore", false, report);
            TestGroundSerialized.Set(so, "parryOpenSeconds", 1.2f, report);
            TestGroundSerialized.Set(so, "sightRange", 22f, report);
            fill(so);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(type);
            return type;
        }

        private static void Body(SerializedObject so, EnemyKind kind, DamageType damageType, float health, float damage, float armor, float poise,
            float attackPoise, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "kind", (int)kind, report);
            TestGroundSerialized.Set(so, "damageType", (int)damageType, report);
            TestGroundSerialized.Set(so, "baseHealth", health, report);
            TestGroundSerialized.Set(so, "baseDamage", damage, report);
            TestGroundSerialized.Set(so, "baseArmor", armor, report);
            TestGroundSerialized.Set(so, "basePoise", poise, report);
            TestGroundSerialized.Set(so, "attackPoise", attackPoise, report);
        }

        private static void Elite(SerializedObject so, float health, float damage, float poise, float statusResistance, TestGroundReport report)
        {
            // GDD 01 11.2: elite ×2 / ×1.3 / ×1.5, champion ×4 / ×1.5 / ×2; they counter sooner after a parry (opening 0.7 s).
            TestGroundSerialized.Set(so, "healthVariantFactor", health, report);
            TestGroundSerialized.Set(so, "damageVariantFactor", damage, report);
            TestGroundSerialized.Set(so, "poiseVariantFactor", poise, report);
            TestGroundSerialized.Set(so, "statusResistance", statusResistance, report);
            TestGroundSerialized.Set(so, "tokenCost", health >= 4f ? 3 : 2, report);
            TestGroundSerialized.Set(so, "parryOpenSeconds", 0.7f, report);
        }

        private static void Moves(SerializedObject so, float walk, float run, float circle, float ringMin, float ringMax, float flee, float perception,
            TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "walkSpeed", walk, report);
            TestGroundSerialized.Set(so, "runSpeed", run, report);
            TestGroundSerialized.Set(so, "circleSpeed", circle, report);
            TestGroundSerialized.Set(so, "ringMin", ringMin, report);
            TestGroundSerialized.Set(so, "ringMax", ringMax, report);
            TestGroundSerialized.Set(so, "fleeHealthFraction", flee, report);
            TestGroundSerialized.Set(so, "perceptionFactor", perception, report);
        }

        private static void Attacks(SerializedObject so, TestGroundReport report,
            params (AttackDefinition attack, float min, float max, float angle, float cooldown, float weight)[] entries)
        {
            SerializedProperty attacks = TestGroundSerialized.Property(so, "attacks", report);
            if (attacks == null)
            {
                return;
            }

            attacks.arraySize = entries.Length;
            for (int i = 0; i < entries.Length; i++)
            {
                TestGroundCombatAssets.SetEnemyAttack(attacks.GetArrayElementAtIndex(i), entries[i].attack, entries[i].min, entries[i].max, entries[i].angle,
                    entries[i].cooldown, entries[i].weight);
            }
        }

        private static void Resist(SerializedObject so, TestGroundReport report, params (DamageType type, float value)[] entries)
        {
            SerializedProperty resistances = TestGroundSerialized.Property(so, "resistances", report);
            if (resistances == null)
            {
                return;
            }

            resistances.arraySize = entries.Length;
            for (int i = 0; i < entries.Length; i++)
            {
                TestGroundCombatAssets.SetResistance(resistances.GetArrayElementAtIndex(i), entries[i].type, entries[i].value);
            }
        }

        private static AttackSpec Melee(string id, float windup, float damage, float poise, float knockback, float lunge, float offsetY = 1.1f,
            float reach = 1.3f)
        {
            AttackSpec spec = AttackSpec.Create(id, windup, 0.15f, 0.55f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = damage;
            spec.PoiseMultiplier = poise;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 25f * poise;
            spec.LungeDistance = lunge;
            spec.KnockbackDistance = knockback;
            spec.OffsetY = offsetY;
            spec.OffsetZ = reach;
            spec.SizeX = 1.4f;
            spec.SizeY = 1.2f;
            spec.SizeZ = reach + 0.4f;
            return spec;
        }

        private static AttackSpec Leap()
        {
            // The Rissling's pounce out of hiding: a long telegraph (it crouches), 3.5 m forward.
            AttackSpec spec = AttackSpec.Create("attack.rissling.sprung", 0.55f, 0.25f, 0.8f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 1.3f;
            spec.PoiseMultiplier = 1.6f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 35f;
            spec.LungeDistance = 3.5f;
            spec.KnockbackDistance = 0.8f;
            spec.OffsetY = 0.5f;
            spec.OffsetZ = 0.9f;
            spec.SizeX = 0.9f;
            spec.SizeY = 0.9f;
            spec.SizeZ = 1.3f;
            return spec;
        }

        private static AttackSpec Bolt()
        {
            // Crossbow bolt: aims 0.9 s (the telegraph), flies 38 m/s straight-ish, stab; blockable, the head counts ×1.75.
            AttackSpec spec = AttackSpec.Create("attack.armbrust.schuss", 0.9f, 0.05f, 1.1f);
            spec.Kind = AttackKind.Enemy;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Stab;
            spec.DamageMultiplier = 1.1f;
            spec.PoiseMultiplier = 0.8f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 20f;
            spec.KnockbackDistance = 0.3f;
            spec.ProjectileSpeed = 38f;
            spec.ProjectileRange = 32f;
            spec.ProjectileRadius = 0.12f;
            spec.ProjectileGravity = 1.5f;
            return spec;
        }
    }
}
