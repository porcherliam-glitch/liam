using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The nine spells of the mage in Stufe A (GDD 03 6.4, 11.5: Pyromant, Frostweber, Blitzbinder with three spells each) as
    /// <see cref="AbilityDefinition"/> assets in <c>Data/Combat/Abilities/</c>. The values are written on every run: they follow
    /// the GDD here, not in the asset. Mana costs are level 1 values (GDD 03 6.3: projectile 10–20, area 20–35, buff 20–30).
    /// </summary>
    public static class SpellAssets
    {
        /// <summary>Feuerball (fire, projectile).</summary>
        public const string Fireball = "ability.feuer.feuerball";

        /// <summary>Flammenteppich (fire, burning ground).</summary>
        public const string FlameCarpet = "ability.feuer.flammenteppich";

        /// <summary>Glutmantel (fire, self-buff).</summary>
        public const string FireMantle = "ability.feuer.glutmantel";

        /// <summary>Eislanze (ice, piercing projectile).</summary>
        public const string IceLance = "ability.eis.eislanze";

        /// <summary>Frostnova (ice, ring around the caster).</summary>
        public const string FrostNova = "ability.eis.frostnova";

        /// <summary>Eispanzer (ice, self-buff).</summary>
        public const string IceArmor = "ability.eis.eispanzer";

        /// <summary>Kettenblitz (lightning, chain).</summary>
        public const string ChainLightning = "ability.blitz.kettenblitz";

        /// <summary>Gewitterruf (lightning, strikes).</summary>
        public const string ThunderCall = "ability.blitz.gewitterruf";

        /// <summary>Sturmschritt (lightning, self-buff).</summary>
        public const string StormStep = "ability.blitz.sturmschritt";

        /// <summary>The first spell of each school: the mage knows them from the class choice until the skill tree exists.</summary>
        public static readonly string[] MageStart = { Fireball, IceLance, ChainLightning };

        /// <summary>Creates or updates the nine spells.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The spells in bar order (the first spell of each school first), missing ones left out.</returns>
        public static List<AbilityDefinition> EnsureAll(TestGroundReport report)
        {
            var spells = new List<AbilityDefinition>(9);
            Add(spells, Ensure("Feuer_Feuerball", Fireball, "Feuerball", AbilityKind.Projectile, DamageType.Fire, report, so =>
            {
                // GDD 03 6.4: explosion 2 m, burning 30.
                Times(so, 15f, 4f, 0.6f, 0.35f, 30f, report);
                Hit(so, 1.6f, 25f, 1.2f, StatusEffectId.Burning, 30f, report);
                Projectile(so, 24f, 0.4f, 1, 2f, 0.7f, report);
            }));
            Add(spells, Ensure("Eis_Eislanze", IceLance, "Eislanze", AbilityKind.Projectile, DamageType.Ice, report, so =>
            {
                // GDD 03 6.4: pierces (hits 2 targets in a row), freezing 35.
                Times(so, 15f, 3f, 0.45f, 0.3f, 30f, report);
                Hit(so, 1.4f, 20f, 0.6f, StatusEffectId.Freezing, 35f, report);
                Projectile(so, 40f, 0.3f, 2, 0f, 0f, report);
            }));
            Add(spells, Ensure("Blitz_Kettenblitz", ChainLightning, "Kettenblitz", AbilityKind.Chain, DamageType.Lightning, report, so =>
            {
                // GDD 03 6.4: jumps to 3 targets, −20 % per jump.
                Times(so, 18f, 5f, 0.45f, 0.3f, 20f, report);
                Hit(so, 1.3f, 15f, 0.3f, StatusEffectId.Shock, 25f, report);
                TestGroundSerialized.Set(so, "chainTargets", 3, report);
                TestGroundSerialized.Set(so, "chainRange", 6f, report);
                TestGroundSerialized.Set(so, "chainFalloff", 0.2f, report);
            }));
            Add(spells, Ensure("Feuer_Flammenteppich", FlameCarpet, "Flammenteppich", AbilityKind.GroundArea, DamageType.Fire, report, so =>
            {
                // GDD 03 6.4: the ground burns for 6 s in a radius of 4 m; per tick (0.5 s) 25 % and burning 10 (= 20 per second).
                Times(so, 25f, 12f, 0.6f, 0.35f, 15f, report);
                Hit(so, 0.25f, 0f, 0f, StatusEffectId.Burning, 10f, report);
                TestGroundSerialized.Set(so, "areaRadius", 4f, report);
                TestGroundSerialized.Set(so, "areaSeconds", 6f, report);
                TestGroundSerialized.Set(so, "areaTickSeconds", 0.5f, report);
            }));
            Add(spells, Ensure("Eis_Frostnova", FrostNova, "Frostnova", AbilityKind.Cone, DamageType.Ice, report, so =>
            {
                // GDD 03 6.4: 5 m around the caster, freezing 50.
                Times(so, 25f, 12f, 0.3f, 0.4f, 5f, report);
                Hit(so, 0.9f, 20f, 0f, StatusEffectId.Freezing, 50f, report);
                TestGroundSerialized.Set(so, "coneAngle", 360f, report);
            }));
            Add(spells, Ensure("Blitz_Gewitterruf", ThunderCall, "Gewitterruf", AbilityKind.Strikes, DamageType.Lightning, report, so =>
            {
                // GDD 03 6.4: 3 strikes in 6 m, shock 40.
                Times(so, 30f, 14f, 0.6f, 0.35f, 20f, report);
                Hit(so, 1.0f, 25f, 0.5f, StatusEffectId.Shock, 40f, report);
                TestGroundSerialized.Set(so, "areaRadius", 6f, report);
                TestGroundSerialized.Set(so, "strikeCount", 3, report);
                TestGroundSerialized.Set(so, "strikeInterval", 0.4f, report);
                TestGroundSerialized.Set(so, "strikeRadius", 2f, report);
            }));
            Add(spells, Ensure("Feuer_Glutmantel", FireMantle, "Glutmantel", AbilityKind.SelfBuff, DamageType.Fire, report, so =>
            {
                // GDD 03 6.4: 10 s fire aura, melee +20 % as fire; the aura builds up burning 10 per second close by.
                Times(so, 25f, 20f, 0.3f, 0.3f, 3f, report);
                Hit(so, 0f, 0f, 0f, StatusEffectId.Burning, 10f, report);
                Buff(so, AbilityBuffKind.FireMantle, 10f, 0.2f, report);
            }));
            Add(spells, Ensure("Eis_Eispanzer", IceArmor, "Eispanzer", AbilityKind.SelfBuff, DamageType.Ice, report, so =>
            {
                // GDD 03 6.4: armor +30 % for 12 s, attackers freezing 10.
                Times(so, 25f, 25f, 0.3f, 0.3f, 3f, report);
                Hit(so, 0f, 0f, 0f, StatusEffectId.Freezing, 10f, report);
                Buff(so, AbilityBuffKind.IceArmor, 12f, 0.3f, report);
            }));
            Add(spells, Ensure("Blitz_Sturmschritt", StormStep, "Sturmschritt", AbilityKind.SelfBuff, DamageType.Lightning, report, so =>
            {
                // GDD 03 6.4: speed +20 % for 8 s, a roll leaves a shock field.
                Times(so, 20f, 20f, 0.2f, 0.2f, 3f, report);
                Hit(so, 0f, 0f, 0f, StatusEffectId.Shock, 0f, report);
                Buff(so, AbilityBuffKind.StormStep, 8f, 0.2f, report);
            }));
            report.Info("Zauber (GDD 03, 6.4): " + spells.Count + " von 9 – Feuer (Feuerball, Flammenteppich, Glutmantel), Eis (Eislanze, Frostnova, " +
                        "Eispanzer), Blitz (Kettenblitz, Gewitterruf, Sturmschritt).");
            return spells;
        }

        private static void Add(List<AbilityDefinition> spells, AbilityDefinition spell)
        {
            if (spell != null)
            {
                spells.Add(spell);
            }
        }

        private static AbilityDefinition Ensure(string file, string id, string name, AbilityKind kind, DamageType element, TestGroundReport report,
            System.Action<SerializedObject> fill)
        {
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.AbilityFolder, report))
            {
                return null;
            }

            var spell = TestGroundSerialized.EnsureAsset<AbilityDefinition>(TestGroundPaths.AbilityFolder + "/" + file + ".asset", report, null);
            if (spell == null)
            {
                return null;
            }

            var so = new SerializedObject(spell);
            TestGroundSerialized.Set(so, "abilityId", id, report);
            TestGroundSerialized.Set(so, "displayName", name, report);
            TestGroundSerialized.Set(so, "kind", (int)kind, report);
            TestGroundSerialized.Set(so, "element", (int)element, report);
            TestGroundSerialized.Set(so, "elementShare", 1f, report);
            TestGroundSerialized.Set(so, "scalesWithWeapon", false, report);
            TestGroundSerialized.Set(so, "corruption", 0f, report);
            TestGroundSerialized.Set(so, "coneAngle", 90f, report);
            TestGroundSerialized.Set(so, "buffKind", (int)AbilityBuffKind.None, report);
            fill(so);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(spell);
            return spell;
        }

        private static void Times(SerializedObject so, float mana, float cooldown, float windup, float recovery, float range, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "manaCost", mana, report);
            TestGroundSerialized.Set(so, "cooldownSeconds", cooldown, report);
            TestGroundSerialized.Set(so, "windupSeconds", windup, report);
            TestGroundSerialized.Set(so, "recoverySeconds", recovery, report);
            TestGroundSerialized.Set(so, "range", range, report);
        }

        private static void Hit(SerializedObject so, float damage, float poise, float knockback, StatusEffectId effect, float buildup, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "damageMultiplier", damage, report);
            TestGroundSerialized.Set(so, "poiseDamage", poise, report);
            TestGroundSerialized.Set(so, "knockbackDistance", knockback, report);
            TestGroundSerialized.Set(so, "buildupEffect", (int)effect, report);
            TestGroundSerialized.Set(so, "buildup", buildup, report);
        }

        private static void Projectile(SerializedObject so, float speed, float radius, int targets, float explosion, float explosionShare, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "projectileSpeed", speed, report);
            TestGroundSerialized.Set(so, "projectileRadius", radius, report);
            TestGroundSerialized.Set(so, "maxTargets", targets, report);
            TestGroundSerialized.Set(so, "explosionRadius", explosion, report);
            TestGroundSerialized.Set(so, "explosionShare", explosionShare, report);
        }

        private static void Buff(SerializedObject so, AbilityBuffKind kind, float seconds, float value, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "buffKind", (int)kind, report);
            TestGroundSerialized.Set(so, "buffSeconds", seconds, report);
            TestGroundSerialized.Set(so, "buffValue", value, report);
        }
    }
}
