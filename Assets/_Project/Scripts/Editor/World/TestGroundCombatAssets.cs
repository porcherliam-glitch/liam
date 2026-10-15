using System.IO;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Data assets of the first playable fight (one-handed sword with wooden shield against wolves): attacks, combo, weapon,
    /// shield, combat settings and the enemy types grey wolf and Aether wolf. Existing assets are reused and never
    /// overwritten (changed values stay); missing ones are created with the values of GDD 03 (and Vorschlaege of this step).
    /// </summary>
    /// <remarks>
    /// Sword timings: light hit 0.82 s with the combo window at 0.45 s (GDD 03 5.1 "Tempo 450 ms", 4.4 "ab ~55 %"), stamina
    /// 12 light / 24 heavy / 18 sprint and jump (4.3, 5.1), the 4th hit is a thrust (stab, ×1.2, poise ×1.5). Wolf: bite with
    /// 0.45 s telegraph, snap 0.4 s, pounce 0.65 s with 4 m leap (9.5: telegraph ≥ 0.4 s, recovery 0.4/0.8–1.2 s).
    /// </remarks>
    public sealed class TestGroundCombatAssets
    {
        /// <summary>Creates or loads all combat assets (folders must exist).</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundCombatAssets(TestGroundReport report)
        {
            GeneratorAssetPins.Hold(this);
            AttackDefinition light1 = EnsureAttack("Einhandschwert_Leicht1", SwordLight("attack.einhandschwert.leicht_1", 0.4f), report);
            AttackDefinition light2 = EnsureAttack("Einhandschwert_Leicht2", SwordLight("attack.einhandschwert.leicht_2", 0.4f), report);
            AttackDefinition light3 = EnsureAttack("Einhandschwert_Leicht3", SwordLight("attack.einhandschwert.leicht_3", 0.5f), report);
            AttackDefinition light4 = EnsureAttack("Einhandschwert_Leicht4_Stich", SwordThrust(), report);
            AttackDefinition heavy = EnsureAttack("Einhandschwert_Schwer", SwordHeavy(), report);
            AttackDefinition sprint = EnsureAttack("Einhandschwert_Sprint", SwordSprint(), report);
            AttackDefinition jump = EnsureAttack("Einhandschwert_Sprung", SwordJump(), report);
            AttackDefinition counter = EnsureAttack("Einhandschwert_Konter", SwordCounter(), report);
            AttackDefinition finisher = EnsureAttack("Einhandschwert_Finisher", SwordFinisher(), report);
            AttackDefinition bite = EnsureAttack("Wolf_Biss", WolfBite(), report);
            AttackDefinition snap = EnsureAttack("Wolf_Schnappen", WolfSnap(), report);
            AttackDefinition pounce = EnsureAttack("Wolf_Sprungangriff", WolfPounce(), report);

            ComboDefinition combo = EnsureCombo(new[] { light1, light2, light3, light4 }, report);
            Shield = EnsureShield(report);
            Weapon = EnsureWeapon(combo, heavy, sprint, jump, counter, finisher, report);
            Settings = EnsureAsset<CombatSettings>(TestGroundPaths.CombatSettingsPath, report, null);
            AetherPush = EnsureAetherPush(report);
            Spells = SpellAssets.EnsureAll(report);
            Wolf = EnsureEnemy("Grauwolf", false, bite, snap, pounce, report);
            AetherWolf = EnsureEnemy("AetherWolf", true, bite, snap, pounce, report);
            Staff = EnsureStaff(finisher, report);
            Mace = EnsureMace(finisher, report);
            Arrow = EnsureAttack("Bogen_Pfeil", BowArrow(), report);
        }

        /// <summary>Wooden arrow of the bow (projectile values; PlayerBow sets damage and speed from the draw, GDD 03 6.1).</summary>
        public AttackDefinition Arrow { get; }

        /// <summary>Apprentice staff moveset (fire bolts, fire ball; GDD 03 5.3).</summary>
        public WeaponDefinition Staff { get; }

        /// <summary>One-handed mace moveset (3 blunt blows, overhead smash; GDD 03 5.3).</summary>
        public WeaponDefinition Mace { get; }

        /// <summary>One-handed sword with moveset.</summary>
        public WeaponDefinition Weapon { get; }

        /// <summary>Wooden shield.</summary>
        public ShieldDefinition Shield { get; }

        /// <summary>Combat rules.</summary>
        public CombatSettings Settings { get; }

        /// <summary>The first ability, Aether-Stoß (ability.aether.aether_stoss, GDD 03 6.5).</summary>
        public AbilityDefinition AetherPush { get; }

        /// <summary>The nine spells of the mage (GDD 03 6.4), the first spell of each school first.</summary>
        public System.Collections.Generic.List<AbilityDefinition> Spells { get; }

        /// <summary>Grey wolf (enemy.wolf.grauwolf, normal, level 8).</summary>
        public EnemyTypeDefinition Wolf { get; }

        /// <summary>Aether wolf (grey wolf, variant aether_verderbt).</summary>
        public EnemyTypeDefinition AetherWolf { get; }

        /// <summary>True if every asset exists.</summary>
        public bool IsComplete => Weapon != null && Shield != null && Settings != null && AetherPush != null && Wolf != null && AetherWolf != null &&
                                  Staff != null && Mace != null && Arrow != null;

        private static AttackSpec BowArrow()
        {
            // GDD 03 6.1: 0.5 g fall, effective range 60 m (it flies on to 75 m), stab, head × 1.75 as every ranged hit.
            AttackSpec spec = AttackSpec.Create("attack.bogen.pfeil", 0.05f, 0.05f, 0.1f);
            spec.Kind = AttackKind.Light;
            spec.ComboWindowStartSeconds = 10f;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Stab;
            spec.DamageMultiplier = 1f;
            spec.PoiseMultiplier = 1f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 12f;
            spec.KnockbackDistance = 0.2f;
            spec.ProjectileSpeed = BowDraw.MaxSpeed;
            spec.ProjectileRange = 75f;
            spec.ProjectileRadius = 0.12f;
            spec.ProjectileGravity = 4.9f;
            return spec;
        }

        private static WeaponDefinition EnsureMace(AttackDefinition finisher, TestGroundReport report)
        {
            // GDD 03 5.3 one-handed mace: combo of 3, tempo 600 ms, blunt, strength 0.6 / wisdom 0.4, stamina 14 / 28, poise 14,
            // shield allowed. Slower and heavier than the sword: more poise damage, more knockback, a little less reach.
            AttackDefinition blow1 = EnsureAttack("Streitkolben_Leicht1", MaceLight("attack.streitkolben.leicht_1", 0.35f, AttackKind.Light), report);
            AttackDefinition blow2 = EnsureAttack("Streitkolben_Leicht2", MaceLight("attack.streitkolben.leicht_2", 0.35f, AttackKind.Light), report);
            AttackDefinition blow3 = EnsureAttack("Streitkolben_Leicht3", MaceLight("attack.streitkolben.leicht_3", 0.6f, AttackKind.ComboFinisher), report);
            AttackSpec smash = MaceLight("attack.streitkolben.schwer", 0.6f, AttackKind.Heavy);
            smash.WindupSeconds = 0.55f;
            smash.RecoverySeconds = 0.75f;
            smash.ComboWindowStartSeconds = 10f;
            smash.CancelOnlyInRecovery = true;
            smash.DamageMultiplier = 1.6f;
            smash.PoiseMultiplier = 1.8f;
            smash.StaminaCost = 28f;
            smash.StaminaDamage = 45f;
            smash.KnockbackDistance = 1.2f;
            AttackDefinition heavy = EnsureAttack("Streitkolben_Schwer", smash, report);
            AttackSpec sprintSpec = MaceLight("attack.streitkolben.sprint", 1.8f, AttackKind.Sprint);
            sprintSpec.ComboWindowStartSeconds = 10f;
            sprintSpec.DamageMultiplier = 1.3f;
            sprintSpec.StaminaCost = 20f;
            AttackDefinition sprint = EnsureAttack("Streitkolben_Sprint", sprintSpec, report);
            AttackSpec jumpSpec = MaceLight("attack.streitkolben.sprung", 0.3f, AttackKind.Jump);
            jumpSpec.WindupSeconds = 0.2f;
            jumpSpec.ComboWindowStartSeconds = 10f;
            jumpSpec.DamageMultiplier = 1.3f;
            jumpSpec.StaminaCost = 20f;
            jumpSpec.OffsetY = 0.7f;
            AttackDefinition jump = EnsureAttack("Streitkolben_Sprung", jumpSpec, report);
            AttackSpec counterSpec = MaceLight("attack.streitkolben.konter", 0.8f, AttackKind.Counter);
            counterSpec.WindupSeconds = 0.14f;
            counterSpec.ComboWindowStartSeconds = 10f;
            counterSpec.CancelOnlyInRecovery = true;
            counterSpec.DamageMultiplier = 3.0f;
            counterSpec.PoiseMultiplier = 2.0f;
            counterSpec.StaminaCost = 0f;
            counterSpec.MaxTurnDegrees = 90f;
            AttackDefinition counter = EnsureAttack("Streitkolben_Konter", counterSpec, report);
            ComboDefinition combo = EnsureAsset<ComboDefinition>(TestGroundPaths.WeaponFolder + "/Streitkolben_Kombo.asset", report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "comboId", "combo.streitkolben.leicht", report);
                SetReferences(so, "steps", new Object[] { blow1, blow2, blow3 }, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
            return EnsureAsset<WeaponDefinition>(TestGroundPaths.WeaponFolder + "/Streitkolben.asset", report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "weaponId", "item.weapon.streitkolben_eisen", report);
                Set(so, "baseDamage", 60f, report);
                Set(so, "damageType", (int)DamageType.Blunt, report);
                Set(so, "weaponPoise", 14f, report);
                Set(so, "strengthWeight", 0.6f, report);
                Set(so, "dexterityWeight", 0f, report);
                Set(so, "wisdomWeight", 0.4f, report);
                Set(so, "lightCombo", combo, report);
                Set(so, "heavyAttack", heavy, report);
                Set(so, "sprintAttack", sprint, report);
                Set(so, "jumpAttack", jump, report);
                Set(so, "counterAttack", counter, report);
                Set(so, "finisher", finisher, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static AttackSpec MaceLight(string id, float lunge, AttackKind kind)
        {
            // Tempo 600 ms (GDD 03 5.1: duration of a light blow up to the combo window); the third blow is an overhead blow.
            bool last = kind == AttackKind.ComboFinisher;
            AttackSpec spec = AttackSpec.Create(id, last ? 0.34f : 0.28f, 0.12f, last ? 0.65f : 0.55f);
            spec.Kind = kind;
            spec.ComboWindowStartSeconds = last ? 0.75f : 0.6f;
            spec.DamageMultiplier = last ? 1.3f : 1f;
            spec.PoiseMultiplier = last ? 1.6f : 1.2f;
            spec.StaminaCost = 14f;
            spec.StaminaDamage = last ? 32f : 24f;
            spec.LungeDistance = lunge;
            spec.KnockbackDistance = last ? 0.9f : 0.4f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.05f;
            spec.SizeX = last ? 1.3f : 1.8f;
            spec.SizeY = last ? 1.8f : 1.3f;
            spec.SizeZ = 1.6f;
            return spec;
        }

        private static WeaponDefinition EnsureStaff(AttackDefinition finisher, TestGroundReport report)
        {
            // GDD 03 5.3 staff: base attack "Elementgeschoss" (25 m, sequence of 3, tempo 500 ms, element of the staff), stamina
            // 6 / 14, grows with intelligence. Heavy: a slower, bigger fire ball. The finisher stays the melee finisher.
            AttackDefinition bolt1 = EnsureAttack("Zauberstab_Geschoss1", StaffBolt("attack.zauberstab.geschoss_1", 0.22f, AttackKind.Light), report);
            AttackDefinition bolt2 = EnsureAttack("Zauberstab_Geschoss2", StaffBolt("attack.zauberstab.geschoss_2", 0.2f, AttackKind.Light), report);
            AttackDefinition bolt3 = EnsureAttack("Zauberstab_Geschoss3", StaffBolt("attack.zauberstab.geschoss_3", 0.26f, AttackKind.ComboFinisher), report);
            AttackDefinition fireball = EnsureAttack("Zauberstab_Feuerball", StaffFireball(), report);
            AttackDefinition sprint = EnsureAttack("Zauberstab_Sprint", StaffBolt("attack.zauberstab.sprint", 0.2f, AttackKind.Sprint), report);
            AttackDefinition jump = EnsureAttack("Zauberstab_Sprung", StaffBolt("attack.zauberstab.sprung", 0.18f, AttackKind.Jump), report);
            AttackSpec counterSpec = StaffBolt("attack.zauberstab.konter", 0.12f, AttackKind.Counter);
            counterSpec.DamageMultiplier = 2.5f;
            counterSpec.StaminaCost = 0f;
            AttackDefinition counter = EnsureAttack("Zauberstab_Konter", counterSpec, report);
            ComboDefinition combo = EnsureAsset<ComboDefinition>(TestGroundPaths.WeaponFolder + "/Zauberstab_Kombo.asset", report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "comboId", "combo.zauberstab.geschoss", report);
                SetReferences(so, "steps", new Object[] { bolt1, bolt2, bolt3 }, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
            return EnsureAsset<WeaponDefinition>(TestGroundPaths.WeaponFolder + "/Zauberstab.asset", report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "weaponId", "item.weapon.lehrlingsstab", report);
                Set(so, "baseDamage", 20f, report);
                Set(so, "damageType", (int)DamageType.Fire, report);
                Set(so, "weaponPoise", 8f, report);
                Set(so, "strengthWeight", 0f, report);
                Set(so, "dexterityWeight", 0f, report);
                Set(so, "intelligenceWeight", 1f, report);
                Set(so, "lightCombo", combo, report);
                Set(so, "heavyAttack", fireball, report);
                Set(so, "sprintAttack", sprint, report);
                Set(so, "jumpAttack", jump, report);
                Set(so, "counterAttack", counter, report);
                Set(so, "finisher", finisher, report);
                // The staff blocks like the barrier of GDD 03 4.7 (140°); the mana cost of the barrier comes later.
                Set(so, "blockAngle", 140f, report);
                Set(so, "blockPhysicalReduction", 0.8f, report);
                Set(so, "blockElementalReduction", 0.8f, report);
                Set(so, "blockStability", 0.3f, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static AttackSpec StaffBolt(string id, float windup, AttackKind kind)
        {
            AttackSpec spec = AttackSpec.Create(id, windup, 0.05f, 0.33f);
            spec.Kind = kind;
            spec.ComboWindowStartSeconds = windup + 0.12f;
            spec.DamageMultiplier = kind == AttackKind.ComboFinisher ? 1.2f : 1f;
            spec.PoiseMultiplier = 0.6f;
            spec.StaminaCost = 6f;
            spec.StaminaDamage = 10f;
            spec.KnockbackDistance = 0.3f;
            spec.MaxTurnDegrees = 90f;
            spec.ProjectileSpeed = 30f;
            spec.ProjectileRange = 25f;
            spec.ProjectileRadius = 0.25f;
            // GDD 03 7.2: fire sources build up burning (Vorschlag for the bolt: 35 like the fire arrow, so the third fire hit sets
            // a target alight; 25 needed four, and a grey wolf dies after two bolts).
            spec.Buildup = StatusBuildup.None.With(StatusEffectId.Burning, 35f);
            return spec;
        }

        private static AttackSpec StaffFireball()
        {
            AttackSpec spec = AttackSpec.Create("attack.zauberstab.feuerball", 0.6f, 0.05f, 0.6f);
            spec.Kind = AttackKind.Heavy;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 1.8f;
            spec.PoiseMultiplier = 1.6f;
            spec.StaminaCost = 14f;
            spec.StaminaDamage = 30f;
            spec.KnockbackDistance = 1.2f;
            spec.MaxTurnDegrees = 90f;
            spec.ProjectileSpeed = 22f;
            spec.ProjectileRange = 25f;
            spec.ProjectileRadius = 0.45f;
            // GDD 03 7.2: fireball burning 30.
            spec.Buildup = StatusBuildup.None.With(StatusEffectId.Burning, 30f);
            return spec;
        }

        private static AbilityDefinition EnsureAetherPush(TestGroundReport report)
        {
            // GDD 03 6.5: cone 6 m / 90°, 120 % of max(weapon damage, spell power), half blunt and half Aether, knockback 3 m,
            // poise 30, 15 mana, cooldown 8 s, +2 corruption.
            string path = TestGroundPaths.AbilityFolder + "/Aether_Stoss.asset";
            return EnsureAsset<AbilityDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "abilityId", "ability.aether.aether_stoss", report);
                Set(so, "displayName", "Aether-Stoß", report);
                Set(so, "manaCost", 15f, report);
                Set(so, "cooldownSeconds", 8f, report);
                Set(so, "windupSeconds", 0.25f, report);
                Set(so, "recoverySeconds", 0.35f, report);
                Set(so, "range", 6f, report);
                Set(so, "coneAngle", 90f, report);
                Set(so, "damageMultiplier", 1.2f, report);
                Set(so, "elementShare", 0.5f, report);
                Set(so, "poiseDamage", 30f, report);
                Set(so, "knockbackDistance", 3f, report);
                Set(so, "corruption", 2f, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static AttackSpec SwordLight(string id, float lunge)
        {
            AttackSpec spec = AttackSpec.Create(id, 0.2f, 0.12f, 0.5f);
            spec.ComboWindowStartSeconds = 0.45f;
            spec.StaminaCost = 12f;
            spec.StaminaDamage = 20f;
            spec.LungeDistance = lunge;
            spec.KnockbackDistance = 0.25f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.9f;
            spec.SizeY = 1.3f;
            spec.SizeZ = 1.7f;
            return spec;
        }

        private static AttackSpec SwordThrust()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.leicht_4_stich", 0.28f, 0.12f, 0.6f);
            spec.Kind = AttackKind.ComboFinisher;
            spec.ComboWindowStartSeconds = 0.6f;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 1.5f;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Stab;
            spec.StaminaCost = 12f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 0.6f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.3f;
            spec.SizeX = 0.9f;
            spec.SizeY = 1.0f;
            spec.SizeZ = 2.1f;
            return spec;
        }

        private static AttackSpec SwordHeavy()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.schwer", 0.45f, 0.15f, 0.7f);
            spec.Kind = AttackKind.Heavy;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 1.5f;
            spec.PoiseMultiplier = 1.5f;
            spec.StaminaCost = 24f;
            spec.StaminaDamage = 35f;
            spec.LungeDistance = 0.6f;
            spec.KnockbackDistance = 0.8f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.8f;
            spec.SizeZ = 1.9f;
            return spec;
        }

        private static AttackSpec SwordSprint()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.sprint", 0.2f, 0.18f, 0.55f);
            spec.Kind = AttackKind.Sprint;
            spec.ComboWindowStartSeconds = 10f;
            spec.DamageMultiplier = 1.3f;
            spec.PoiseMultiplier = 1.5f;
            spec.StaminaCost = 18f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 2.0f;
            spec.KnockbackDistance = 0.8f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.4f;
            spec.SizeY = 1.3f;
            spec.SizeZ = 2.0f;
            return spec;
        }

        private static AttackSpec SwordJump()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.sprung", 0.15f, 0.2f, 0.45f);
            spec.Kind = AttackKind.Jump;
            spec.ComboWindowStartSeconds = 10f;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 1.3f;
            spec.StaminaCost = 18f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.3f;
            spec.KnockbackDistance = 0.5f;
            spec.OffsetY = 0.7f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.8f;
            spec.SizeZ = 1.8f;
            return spec;
        }

        private static AttackSpec SwordCounter()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.konter", 0.12f, 0.15f, 0.45f);
            spec.Kind = AttackKind.Counter;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 3.0f;
            spec.PoiseMultiplier = 2.0f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 1.0f;
            spec.MaxTurnDegrees = 90f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.9f;
            spec.SizeY = 1.4f;
            spec.SizeZ = 1.9f;
            return spec;
        }

        private static AttackSpec SwordFinisher()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.finisher", 0.8f, 0.1f, 0.7f);
            spec.Kind = AttackKind.Finisher;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 5f;
            spec.PoiseMultiplier = 0f;
            spec.StaminaCost = 0f;
            spec.LungeDistance = 0f;
            spec.KnockbackDistance = 0f;
            spec.MaxTurnDegrees = 180f;
            return spec;
        }

        private static AttackSpec WolfBite()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.biss", 0.45f, 0.15f, 0.45f);
            spec.Kind = AttackKind.Enemy;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 0.4f;
            spec.OffsetY = 0.6f;
            spec.OffsetZ = 1.0f;
            spec.SizeX = 0.9f;
            spec.SizeY = 0.9f;
            spec.SizeZ = 1.3f;
            return spec;
        }

        private static AttackSpec WolfSnap()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.schnappen", 0.4f, 0.12f, 0.4f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 0.7f;
            spec.PoiseMultiplier = 0.7f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 15f;
            spec.LungeDistance = 0.4f;
            spec.KnockbackDistance = 0.2f;
            spec.OffsetY = 0.6f;
            spec.OffsetZ = 0.9f;
            spec.SizeX = 0.8f;
            spec.SizeY = 0.8f;
            spec.SizeZ = 1.1f;
            return spec;
        }

        private static AttackSpec WolfPounce()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.sprungangriff", 0.65f, 0.3f, 0.95f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 1.4f;
            spec.PoiseMultiplier = 2.0f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.LungeDistance = 4.0f;
            spec.KnockbackDistance = 1.0f;
            spec.OffsetY = 0.7f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.0f;
            spec.SizeY = 1.0f;
            spec.SizeZ = 1.5f;
            return spec;
        }

        private static AttackDefinition EnsureAttack(string fileName, AttackSpec spec, TestGroundReport report)
        {
            AttackDefinition attack = EnsureAttackAsset(fileName, spec, report);
            if (attack != null)
            {
                SetStatusBuildup(attack, spec, report);
            }

            return attack;
        }

        /// <summary>
        /// Status build-up of an attack (GDD 03 7.1), written on every run, also to attacks created by an earlier run (the staff
        /// bolts got their burning after the status effects existed).
        /// </summary>
        private static void SetStatusBuildup(AttackDefinition attack, AttackSpec spec, TestGroundReport report)
        {
            StatusEffectId effect = StatusEffectId.Burning;
            float amount = 0f;
            for (int i = 0; i < 8; i++)
            {
                float value = spec.Buildup.Get((StatusEffectId)i);
                if (value > amount)
                {
                    effect = (StatusEffectId)i;
                    amount = value;
                }
            }

            var so = new SerializedObject(attack);
            SerializedProperty current = so.FindProperty("statusBuildup");
            SerializedProperty currentEffect = so.FindProperty("statusEffect");
            if (current == null || currentEffect == null || (Mathf.Approximately(current.floatValue, amount) && currentEffect.intValue == (int)effect))
            {
                return;
            }

            Set(so, "statusEffect", (int)effect, report);
            Set(so, "statusBuildup", amount, report);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(attack);
            if (amount > 0f)
            {
                report.Info(attack.name + ": Statusaufbau " + effect + " " + amount.ToString("0") + ".");
            }
        }

        private static AttackDefinition EnsureAttackAsset(string fileName, AttackSpec spec, TestGroundReport report)
        {
            string path = TestGroundPaths.AttackFolder + "/" + fileName + ".asset";
            return EnsureAsset<AttackDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "attackId", spec.Id, report);
                Set(so, "kind", (int)spec.Kind, report);
                Set(so, "windupSeconds", spec.WindupSeconds, report);
                Set(so, "activeSeconds", spec.ActiveSeconds, report);
                Set(so, "recoverySeconds", spec.RecoverySeconds, report);
                Set(so, "comboWindowStartSeconds", spec.ComboWindowStartSeconds, report);
                Set(so, "cancelOnlyInRecovery", spec.CancelOnlyInRecovery, report);
                Set(so, "damageMultiplier", spec.DamageMultiplier, report);
                Set(so, "poiseMultiplier", spec.PoiseMultiplier, report);
                Set(so, "staminaCost", spec.StaminaCost, report);
                Set(so, "staminaDamage", spec.StaminaDamage, report);
                Set(so, "overrideDamageType", spec.OverrideDamageType, report);
                Set(so, "damageType", (int)spec.DamageType, report);
                Set(so, "unblockable", spec.Unblockable, report);
                Set(so, "unparryable", spec.Unparryable, report);
                Set(so, "shape", (int)spec.Shape, report);
                Set(so, "offset", new Vector3(spec.OffsetX, spec.OffsetY, spec.OffsetZ), report);
                Set(so, "size", new Vector3(spec.SizeX, spec.SizeY, spec.SizeZ), report);
                Set(so, "radius", spec.Radius, report);
                Set(so, "lungeDistance", spec.LungeDistance, report);
                Set(so, "knockbackDistance", spec.KnockbackDistance, report);
                Set(so, "maxTurnDegrees", spec.MaxTurnDegrees, report);
                Set(so, "projectileSpeed", spec.ProjectileSpeed, report);
                Set(so, "projectileRange", spec.ProjectileRange, report);
                Set(so, "projectileRadius", spec.ProjectileRadius, report);
                Set(so, "projectileGravity", spec.ProjectileGravity, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static ComboDefinition EnsureCombo(AttackDefinition[] steps, TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Einhandschwert_Kombo.asset";
            return EnsureAsset<ComboDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "comboId", "combo.einhandschwert.leicht", report);
                SetReferences(so, "steps", steps, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static ShieldDefinition EnsureShield(TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Holzschild.asset";
            return EnsureAsset<ShieldDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "shieldId", "item.shield.holzschild", report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static WeaponDefinition EnsureWeapon(ComboDefinition combo, AttackDefinition heavy, AttackDefinition sprint, AttackDefinition jump,
            AttackDefinition counter, AttackDefinition finisher, TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Einhandschwert.asset";
            return EnsureAsset<WeaponDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "weaponId", "item.weapon.einhandschwert_eisen", report);
                Set(so, "baseDamage", 50f, report);
                Set(so, "damageType", (int)DamageType.Slash, report);
                Set(so, "weaponPoise", 10f, report);
                Set(so, "lightCombo", combo, report);
                Set(so, "heavyAttack", heavy, report);
                Set(so, "sprintAttack", sprint, report);
                Set(so, "jumpAttack", jump, report);
                Set(so, "counterAttack", counter, report);
                Set(so, "finisher", finisher, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static EnemyTypeDefinition EnsureEnemy(string fileName, bool aether, AttackDefinition bite, AttackDefinition snap,
            AttackDefinition pounce, TestGroundReport report)
        {
            string path = TestGroundPaths.EnemyFolder + "/" + fileName + ".asset";
            return EnsureAsset<EnemyTypeDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "enemyTypeId", "enemy.wolf.grauwolf", report);
                Set(so, "variantId", aether ? "aether_verderbt" : "normal", report);
                Set(so, "displayName", aether ? "Aether-Wolf" : "Grauwolf", report);
                Set(so, "level", Aetherfall.EditorTools.Narrative.TestGroundLevels.WolfLevel, report);
                Set(so, "lootTableId", string.Empty, report);
                Set(so, "baseHealth", 70f, report);
                Set(so, "baseDamage", 25f, report);
                Set(so, "damageType", (int)DamageType.Stab, report);
                Set(so, "baseArmor", 15f, report);
                Set(so, "basePoise", 30f, report);
                Set(so, "attackPoise", 12f, report);
                Set(so, "aetherDamageShare", aether ? 0.25f : 0f, report);
                Set(so, "hasCrystalCore", aether, report);
                // Aether-corrupted enemies do not flee (Vorschlag); animals flee below 25 % health (GDD 03 9.4).
                Set(so, "fleeHealthFraction", aether ? 0f : 0.25f, report);
                Set(so, "perceptionFactor", 1.5f, report);

                SerializedProperty resistances = so.FindProperty("resistances");
                if (resistances != null)
                {
                    resistances.arraySize = aether ? 2 : 1;
                    SetResistance(resistances.GetArrayElementAtIndex(0), DamageType.Fire, -0.5f);
                    if (aether)
                    {
                        SetResistance(resistances.GetArrayElementAtIndex(1), DamageType.Aether, 0.5f);
                    }
                }

                SerializedProperty attacks = so.FindProperty("attacks");
                if (attacks != null)
                {
                    attacks.arraySize = 3;
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(0), bite, 0f, 2.2f, 30f, 1.6f, 3f);
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(1), snap, 0f, 1.8f, 30f, 1.2f, 2f);
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(2), pounce, 3.0f, 6.0f, 25f, 4.0f, 2f);
                }

                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static void SetResistance(SerializedProperty element, DamageType type, float value)
        {
            element.FindPropertyRelative("damageType").intValue = (int)type;
            element.FindPropertyRelative("value").floatValue = value;
            element.FindPropertyRelative("immune").boolValue = false;
        }

        private static void SetEnemyAttack(SerializedProperty element, AttackDefinition attack, float minRange, float maxRange, float maxAngle,
            float cooldown, float weight)
        {
            element.FindPropertyRelative("attack").objectReferenceValue = attack;
            element.FindPropertyRelative("minRange").floatValue = minRange;
            element.FindPropertyRelative("maxRange").floatValue = maxRange;
            element.FindPropertyRelative("maxAngle").floatValue = maxAngle;
            element.FindPropertyRelative("cooldown").floatValue = cooldown;
            element.FindPropertyRelative("weight").floatValue = weight;
        }

        private static T EnsureAsset<T>(string path, TestGroundReport report, System.Action<T> fill) where T : ScriptableObject
        {
            T existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                report.Info("Vorhanden (unverändert): " + path);
                return existing;
            }

            if (File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, path)))
            {
                report.Warning(path + " existiert, ist aber kein " + typeof(T).Name + " – bitte prüfen.");
                return null;
            }

            T asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
            if (fill != null)
            {
                fill(asset);
            }

            EditorUtility.SetDirty(asset);
            report.Info("Angelegt: " + path);
            return asset;
        }

        private static void Set(SerializedObject so, string field, float value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, int value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, bool value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.boolValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, string value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.stringValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, Vector3 value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.vector3Value = value;
            }
        }

        private static void Set(SerializedObject so, string field, Object value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.objectReferenceValue = value;
            }
        }

        private static void SetReferences(SerializedObject so, string field, Object[] values, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property == null || !property.isArray)
            {
                return;
            }

            property.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
            {
                property.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            }
        }

        private static SerializedProperty Property(SerializedObject so, string field, TestGroundReport report)
        {
            SerializedProperty property = so.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + so.targetObject.GetType().Name + " nicht gefunden (Code umbenannt?).");
            }

            return property;
        }
    }
}
