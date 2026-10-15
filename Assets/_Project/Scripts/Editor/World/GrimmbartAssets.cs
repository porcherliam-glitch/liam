using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Data of Grimmbart, the bandit king (GDD 02 11.6, GDD 01 11.4): his enemy type (humanoid, level 7, resists Wucht by 20 %),
    /// his attacks (hammer blows, ground stomp, charge over 15 m, war horn, crane, fire pot, the falling stone) and the
    /// <see cref="BossDefinition"/> "Boss_Grimmbart" with three phases (100 / 60 / 30 %) and kneeling at 10 %.
    /// </summary>
    public static class GrimmbartAssets
    {
        /// <summary>Enemy type id.</summary>
        public const string TypeId = "enemy.bandit.grimmbart";

        /// <summary>Boss id.</summary>
        public const string BossId = "boss.eichental.grimmbart";

        /// <summary>Level of the fight (GDD 02 11.6: recommended level 7).</summary>
        public const int Level = 7;

        /// <summary>The enemy type (after <see cref="EnsureAll"/>).</summary>
        public static EnemyTypeDefinition Type { get; private set; }

        /// <summary>The boss data (after <see cref="EnsureAll"/>).</summary>
        public static BossDefinition Boss { get; private set; }

        /// <summary>Attack of a falling crane stone (after <see cref="EnsureAll"/>).</summary>
        public static AttackDefinition FallingStone { get; private set; }

        /// <summary>Creates or updates type, attacks and boss data.</summary>
        /// <param name="report">Protocol.</param>
        public static void EnsureAll(TestGroundReport report)
        {
            AttackDefinition blow = TestGroundCombatAssets.EnsureAttack("Grimmbart_Hammerschlag", HammerBlow(), report);
            AttackDefinition swing = TestGroundCombatAssets.EnsureAttack("Grimmbart_Hammerschwung", HammerSwing(), report);
            AttackDefinition overhead = TestGroundCombatAssets.EnsureAttack("Grimmbart_Hammerhieb", HammerOverhead(), report);
            AttackDefinition stomp = TestGroundCombatAssets.EnsureAttack("Grimmbart_Bodenstampfer", Stomp(), report);
            AttackDefinition charge = TestGroundCombatAssets.EnsureAttack("Grimmbart_Sturmangriff", Charge(), report);
            AttackDefinition horn = TestGroundCombatAssets.EnsureAttack("Grimmbart_Kriegshorn", Special("attack.grimmbart.kriegshorn", 1.2f, 0.8f), report);
            AttackDefinition crane = TestGroundCombatAssets.EnsureAttack("Grimmbart_Kranruf", Special("attack.grimmbart.kranruf", 0.9f, 0.7f), report);
            AttackDefinition pot = TestGroundCombatAssets.EnsureAttack("Grimmbart_Brandtopf", Special("attack.grimmbart.brandtopf", 0.7f, 0.6f), report);
            FallingStone = TestGroundCombatAssets.EnsureAttack("Grimmbart_Steinschlag", FallingStoneSpec(), report);

            Type = SliceEnemyAssets.Ensure("Grimmbart", TypeId, "champion", "Grimmbart", report, so =>
            {
                SliceEnemyAssets.Body(so, EnemyKind.Humanoid, DamageType.Blunt, 95f, 24f, 30f, 80f, 20f, report);
                SliceEnemyAssets.Elite(so, 5f, 1.5f, 2f, 100f, report);
                SliceEnemyAssets.Moves(so, 1.6f, 4.6f, 2f, 2.5f, 5f, 0f, 1.2f, report);
                TestGroundSerialized.Set(so, "level", Level, report);
                TestGroundSerialized.Set(so, "turnRate", 120f, report);
                TestGroundSerialized.Set(so, "parryPoiseLoss", 0.12f, report);
                TestGroundSerialized.Set(so, "parryOpenSeconds", 1.4f, report);
                TestGroundSerialized.Set(so, "leashDistance", 80f, report);
                // GDD 02 11.6: "Resistenz: Wucht −20 %" (he takes a fifth less from blunt weapons).
                SliceEnemyAssets.Resist(so, report, (DamageType.Blunt, 0.2f));
            });

            Boss = TestGroundSerialized.EnsureAsset<BossDefinition>(TestGroundPaths.EnemyFolder + "/Boss_Grimmbart.asset", report, so =>
            {
                TestGroundSerialized.Set(so, "bossId", BossId, report);
                TestGroundSerialized.Set(so, "displayName", "Grimmbart", report);
                TestGroundSerialized.Set(so, "title", "Banditenkönig des Eichentals", report);
                TestGroundSerialized.Set(so, "baseType", Type, report);
                TestGroundSerialized.Set(so, "musicId", "mus.boss_grimmbart", report);
                SerializedProperty phases = TestGroundSerialized.Property(so, "phaseThresholds", report);
                if (phases != null)
                {
                    phases.arraySize = 3;
                    phases.GetArrayElementAtIndex(0).floatValue = 1f;
                    phases.GetArrayElementAtIndex(1).floatValue = 0.6f;
                    phases.GetArrayElementAtIndex(2).floatValue = 0.3f;
                }

                SerializedProperty adds = TestGroundSerialized.Property(so, "addsPerPhase", report);
                if (adds != null)
                {
                    adds.arraySize = 3;
                    for (int i = 0; i < 3; i++)
                    {
                        adds.GetArrayElementAtIndex(i).intValue = 0;
                    }
                }

                TestGroundSerialized.Set(so, "transitionSeconds", 2f, report);
                TestGroundSerialized.Set(so, "awakenSeconds", 1.5f, report);
                // No shield: Grimmbart blocks nothing (GDD 02 11.6), the beam of the crypt does not exist here.
                TestGroundSerialized.Set(so, "guardReduction", 0f, report);
                TestGroundSerialized.Set(so, "parryOpenSeconds", 1.4f, report);
                TestGroundSerialized.Set(so, "recoverSeconds", 0.7f, report);
                TestGroundSerialized.Set(so, "beamFromPhase", 5, report);
                TestGroundSerialized.Set(so, "yieldFraction", 0.1f, report);
                TestGroundSerialized.Set(so, "yieldSeconds", 5f, report);
                SerializedProperty attacks = TestGroundSerialized.Property(so, "attacks", report);
                if (attacks != null)
                {
                    attacks.arraySize = 8;
                    SetBossAttack(attacks.GetArrayElementAtIndex(0), blow, 0f, 2.8f, 30f, 2.5f, 3f, 1, 0, string.Empty);
                    SetBossAttack(attacks.GetArrayElementAtIndex(1), swing, 0f, 3.0f, 40f, 3.5f, 2f, 1, 0, string.Empty);
                    SetBossAttack(attacks.GetArrayElementAtIndex(2), overhead, 0f, 2.8f, 25f, 5f, 1.5f, 1, 0, string.Empty);
                    SetBossAttack(attacks.GetArrayElementAtIndex(3), stomp, 0f, 3.5f, 180f, 8f, 1.5f, 1, 0, string.Empty);
                    SetBossAttack(attacks.GetArrayElementAtIndex(4), horn, 0f, 40f, 180f, 30f, 6f, 1, 1, BossHornCall.SpecialKey);
                    SetBossAttack(attacks.GetArrayElementAtIndex(5), charge, 6f, 15f, 20f, 9f, 4f, 2, 0, string.Empty);
                    SetBossAttack(attacks.GetArrayElementAtIndex(6), crane, 0f, 40f, 180f, 14f, 4f, 2, 2, BossCraneDrop.SpecialKey);
                    SetBossAttack(attacks.GetArrayElementAtIndex(7), pot, 4f, 18f, 40f, 7f, 4f, 3, 0, BossFirePots.SpecialKey);
                }
            });
            report.Info("Grimmbart (GDD 02, 11.6): Stufe " + Level + ", " + (Type != null ? Type.MaxHealth.ToString("0") : "?") +
                        " LP, Phasen 100/60/30 %, kniet bei 10 %; Hammer, Stampfer, Horn (Phase 1), Sturmangriff und Kran (Phase 2), Brandtöpfe (Phase 3).");
        }

        private static void SetBossAttack(SerializedProperty element, AttackDefinition attack, float minRange, float maxRange, float maxAngle,
            float cooldown, float weight, int minPhase, int maxPhase, string special)
        {
            TestGroundCombatAssets.SetEnemyAttack(element, attack, minRange, maxRange, maxAngle, cooldown, weight);
            element.FindPropertyRelative("minPhase").intValue = minPhase;
            element.FindPropertyRelative("dropsGuard").boolValue = false;
            element.FindPropertyRelative("maxPhase").intValue = maxPhase;
            element.FindPropertyRelative("special").stringValue = special ?? string.Empty;
        }

        private static AttackSpec HammerBlow()
        {
            // Combo blow 1-2 (GDD: the hammer rises for 0.8 s; parryable).
            AttackSpec spec = SliceEnemyAssets.Melee("attack.grimmbart.hammerschlag", 0.8f, 1.1f, 1.6f, 1.2f, 0.6f, 1.2f, 1.6f);
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.SizeX = 1.8f;
            return spec;
        }

        private static AttackSpec HammerSwing()
        {
            AttackSpec spec = SliceEnemyAssets.Melee("attack.grimmbart.hammerschwung", 0.8f, 1.0f, 1.8f, 1.6f, 0.8f, 1.1f, 1.7f);
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.SizeX = 2.8f;
            return spec;
        }

        private static AttackSpec HammerOverhead()
        {
            // Third blow: overhead, cannot be parried, only dodged sideways.
            AttackSpec spec = SliceEnemyAssets.Melee("attack.grimmbart.hammerhieb", 1.0f, 1.6f, 2.6f, 2.0f, 0.8f, 1.0f, 1.8f);
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.Unparryable = true;
            spec.SizeX = 1.4f;
            spec.ShakeAmplitude = 0.35f;
            spec.ShakeDuration = 0.25f;
            return spec;
        }

        private static AttackSpec Stomp()
        {
            // Ground stomp: Wucht in 4 m around him.
            AttackSpec spec = AttackSpec.Create("attack.grimmbart.bodenstampfer", 0.9f, 0.2f, 0.9f);
            spec.Kind = AttackKind.Enemy;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 2.2f;
            spec.Unparryable = true;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.Shape = HitboxShape.Sphere;
            spec.Radius = 4f;
            spec.OffsetY = 0.6f;
            spec.OffsetZ = 0f;
            spec.KnockbackDistance = 2f;
            spec.MaxTurnDegrees = 0f;
            spec.ShakeAmplitude = 0.5f;
            spec.ShakeDuration = 0.35f;
            return spec;
        }

        private static AttackSpec Charge()
        {
            // Charge over about 15 m (GDD: scraping 1.0 s); straight on - a stone block in his way stops him.
            AttackSpec spec = AttackSpec.Create("attack.grimmbart.sturmangriff", 1.0f, 0.8f, 1.2f);
            spec.Kind = AttackKind.Enemy;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.DamageMultiplier = 1.5f;
            spec.PoiseMultiplier = 3f;
            spec.Unblockable = true;
            spec.Unparryable = true;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 0f;
            spec.LungeDistance = 14f;
            spec.KnockbackDistance = 2.5f;
            spec.OffsetY = 1.1f;
            spec.OffsetZ = 1.0f;
            spec.SizeX = 1.8f;
            spec.SizeY = 1.8f;
            spec.SizeZ = 1.6f;
            spec.MaxTurnDegrees = 0f;
            spec.ShakeAmplitude = 0.5f;
            spec.ShakeDuration = 0.3f;
            return spec;
        }

        private static AttackSpec Special(string id, float windup, float recovery)
        {
            // A special attack has no hit of its own: the boss mechanics act when its "hit window" opens.
            AttackSpec spec = AttackSpec.Create(id, windup, 0.1f, recovery);
            spec.Kind = AttackKind.Enemy;
            spec.StaminaCost = 0f;
            spec.MaxTurnDegrees = 0f;
            return spec;
        }

        private static AttackSpec FallingStoneSpec()
        {
            AttackSpec spec = AttackSpec.Create("attack.grimmbart.steinschlag", 0.01f, 0.1f, 0.1f);
            spec.Kind = AttackKind.Enemy;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.PoiseMultiplier = 2.5f;
            spec.Unblockable = true;
            spec.Unparryable = true;
            spec.IsExplosion = false;
            spec.StaminaCost = 0f;
            spec.KnockbackDistance = 1.5f;
            spec.ShakeAmplitude = 0.4f;
            spec.ShakeDuration = 0.3f;
            return spec;
        }
    }
}
