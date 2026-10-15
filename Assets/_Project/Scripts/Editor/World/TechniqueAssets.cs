using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The five active techniques of the warrior in Stufe A (GDD 03 11.4, nodes WM03, BW03, BW05, KH03, KH04) as
    /// <see cref="AbilityDefinition"/> assets in <c>Data/Combat/Abilities/</c>. They cost stamina instead of mana and use the
    /// weapon damage as reference. The values are written on every run (they follow the GDD here).
    /// </summary>
    public static class TechniqueAssets
    {
        /// <summary>Wirbelklinge (360° whirl, 2 rotations).</summary>
        public const string Whirl = "ability.krieger.wirbelklinge";

        /// <summary>Schildschlag (shield bash, needs a shield).</summary>
        public const string ShieldBash = "ability.krieger.schildschlag";

        /// <summary>Spott (taunt).</summary>
        public const string Taunt = "ability.krieger.spott";

        /// <summary>Kriegsschrei (war cry).</summary>
        public const string WarCry = "ability.krieger.kriegsschrei";

        /// <summary>Fußfeger (sweep, knockdown).</summary>
        public const string Sweep = "ability.krieger.fussfeger";

        /// <summary>Creates or updates the five techniques.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The techniques, missing ones left out.</returns>
        public static List<AbilityDefinition> EnsureAll(TestGroundReport report)
        {
            var techniques = new List<AbilityDefinition>(5);
            Add(techniques, Ensure("Krieger_Wirbelklinge", Whirl, "Wirbelklinge", AbilityKind.Cone, DamageType.Slash, report, so =>
            {
                // GDD 03 11.4 WM03: 360° whirl, 2 rotations, each 140 % weapon damage, 30 stamina, cooldown 8 s.
                Times(so, 30f, 8f, 0.3f, 0.45f, 2.8f, report);
                Hit(so, 1.4f, 20f, 0.8f, report);
                TestGroundSerialized.Set(so, "coneAngle", 360f, report);
                TestGroundSerialized.Set(so, "repeats", 2, report);
                TestGroundSerialized.Set(so, "repeatInterval", 0.35f, report);
            }));
            Add(techniques, Ensure("Krieger_Schildschlag", ShieldBash, "Schildschlag", AbilityKind.Cone, DamageType.Blunt, report, so =>
            {
                // BW03: shield bash, poise 40, stun 50, interrupts normal enemies, 15 stamina, cooldown 6 s, needs a shield.
                Times(so, 15f, 6f, 0.2f, 0.35f, 2.5f, report);
                Hit(so, 0.6f, 40f, 1.0f, report);
                TestGroundSerialized.Set(so, "coneAngle", 80f, report);
                TestGroundSerialized.Set(so, "buildupEffect", (int)StatusEffectId.Stun, report);
                TestGroundSerialized.Set(so, "buildup", 50f, report);
                TestGroundSerialized.Set(so, "staggerSeconds", 1f, report);
                TestGroundSerialized.Set(so, "requiresShield", true, report);
            }));
            Add(techniques, Ensure("Krieger_Spott", Taunt, "Spott", AbilityKind.Shout, DamageType.Blunt, report, so =>
            {
                // BW05: war shout 10 m, enemies attack the warrior for 6 s, armor +20 % for that time, cooldown 15 s.
                Times(so, 0f, 15f, 0.25f, 0.3f, 10f, report);
                Hit(so, 0f, 0f, 0f, report);
                TestGroundSerialized.Set(so, "areaRadius", 10f, report);
                TestGroundSerialized.Set(so, "tauntSeconds", 6f, report);
                TestGroundSerialized.Set(so, "buffKind", (int)AbilityBuffKind.Guard, report);
                TestGroundSerialized.Set(so, "buffSeconds", 6f, report);
                TestGroundSerialized.Set(so, "buffValue", 0.2f, report);
            }));
            Add(techniques, Ensure("Krieger_Kriegsschrei", WarCry, "Kriegsschrei", AbilityKind.Shout, DamageType.Blunt, report, so =>
            {
                // KH03: 8 m, enemy damage −20 % for 8 s, normal enemies stagger 1 s, 20 stamina, cooldown 20 s.
                Times(so, 20f, 20f, 0.3f, 0.35f, 8f, report);
                Hit(so, 0f, 0f, 0f, report);
                TestGroundSerialized.Set(so, "areaRadius", 8f, report);
                TestGroundSerialized.Set(so, "weakenFraction", 0.2f, report);
                TestGroundSerialized.Set(so, "weakenSeconds", 8f, report);
                TestGroundSerialized.Set(so, "staggerSeconds", 1f, report);
            }));
            Add(techniques, Ensure("Krieger_Fussfeger", Sweep, "Fußfeger", AbilityKind.Cone, DamageType.Blunt, report, so =>
            {
                // KH04: low circular sweep 3 m, knocks enemies down for 1.2 s (not bosses), 90 % weapon damage, 25 stamina, cooldown 12 s.
                Times(so, 25f, 12f, 0.35f, 0.45f, 3f, report);
                Hit(so, 0.9f, 30f, 0f, report);
                TestGroundSerialized.Set(so, "coneAngle", 360f, report);
                TestGroundSerialized.Set(so, "knockdownSeconds", 1.2f, report);
            }));
            report.Info("Krieger-Techniken (GDD 03, 11.4): " + techniques.Count + " von 5 – Wirbelklinge, Schildschlag, Spott, Kriegsschrei, Fußfeger.");
            return techniques;
        }

        private static void Add(List<AbilityDefinition> list, AbilityDefinition technique)
        {
            if (technique != null)
            {
                list.Add(technique);
            }
        }

        private static AbilityDefinition Ensure(string file, string id, string name, AbilityKind kind, DamageType element, TestGroundReport report,
            System.Action<SerializedObject> fill)
        {
            if (!TestGroundAssets.EnsureFolder(TestGroundPaths.AbilityFolder, report))
            {
                return null;
            }

            var technique = TestGroundSerialized.EnsureAsset<AbilityDefinition>(TestGroundPaths.AbilityFolder + "/" + file + ".asset", report, null);
            if (technique == null)
            {
                return null;
            }

            var so = new SerializedObject(technique);
            TestGroundSerialized.Set(so, "abilityId", id, report);
            TestGroundSerialized.Set(so, "displayName", name, report);
            TestGroundSerialized.Set(so, "kind", (int)kind, report);
            TestGroundSerialized.Set(so, "element", (int)element, report);
            TestGroundSerialized.Set(so, "elementShare", 1f, report);
            TestGroundSerialized.Set(so, "scalesWithWeapon", true, report);
            TestGroundSerialized.Set(so, "corruption", 0f, report);
            TestGroundSerialized.Set(so, "coneAngle", 90f, report);
            TestGroundSerialized.Set(so, "buffKind", (int)AbilityBuffKind.None, report);
            TestGroundSerialized.Set(so, "buildup", 0f, report);
            TestGroundSerialized.Set(so, "repeats", 1, report);
            TestGroundSerialized.Set(so, "requiresShield", false, report);
            TestGroundSerialized.Set(so, "staggerSeconds", 0f, report);
            TestGroundSerialized.Set(so, "knockdownSeconds", 0f, report);
            TestGroundSerialized.Set(so, "tauntSeconds", 0f, report);
            TestGroundSerialized.Set(so, "weakenFraction", 0f, report);
            fill(so);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(technique);
            return technique;
        }

        private static void Times(SerializedObject so, float stamina, float cooldown, float windup, float recovery, float range, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "manaCost", 0f, report);
            TestGroundSerialized.Set(so, "staminaCost", stamina, report);
            TestGroundSerialized.Set(so, "cooldownSeconds", cooldown, report);
            TestGroundSerialized.Set(so, "windupSeconds", windup, report);
            TestGroundSerialized.Set(so, "recoverySeconds", recovery, report);
            TestGroundSerialized.Set(so, "range", range, report);
        }

        private static void Hit(SerializedObject so, float damage, float poise, float knockback, TestGroundReport report)
        {
            TestGroundSerialized.Set(so, "damageMultiplier", damage, report);
            TestGroundSerialized.Set(so, "poiseDamage", poise, report);
            TestGroundSerialized.Set(so, "knockbackDistance", knockback, report);
        }
    }
}
