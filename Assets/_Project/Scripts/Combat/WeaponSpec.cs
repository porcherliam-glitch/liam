using System;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Plain data of a weapon for the combat state machine (built from <c>WeaponDefinition</c>, or in tests): base damage W,
    /// damage type, poise value H_Waffe, attribute weights and the moveset (light combo 3–5 steps, heavy, sprint, jump,
    /// counter and finisher attack, GDD 03 4.4–4.10, 5.1) plus the block values of the weapon or the shield in the off hand.
    /// </summary>
    public sealed class WeaponSpec
    {
        /// <summary>Id, e.g. <c>item.weapon.einhandschwert_rost</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Weapon damage W (GDD 03 8.2 step 1).</summary>
        public float BaseDamage { get; set; } = 20f;

        /// <summary>Main damage type (one-handed sword: slash).</summary>
        public DamageType DamageType { get; set; } = DamageType.Slash;

        /// <summary>Poise value H_Waffe (one-handed sword: 10, GDD 03 5.1).</summary>
        public float WeaponPoise { get; set; } = 10f;

        /// <summary>Attribute weights (one-handed sword: strength 0.6, dexterity 0.4).</summary>
        public AttributeScaling Scaling { get; set; } = AttributeScaling.OneHandedSword;

        /// <summary>Steps of the light combo in order (3–5; the last one is the combo finisher).</summary>
        public AttackSpec[] LightCombo { get; set; } = Array.Empty<AttackSpec>();

        /// <summary>Heavy attack (uncharged; the charge levels scale it, GDD 03 4.5).</summary>
        public AttackSpec Heavy { get; set; }

        /// <summary>Sprint attack (GDD 03 4.6).</summary>
        public AttackSpec Sprint { get; set; }

        /// <summary>Jump attack (GDD 03 4.6).</summary>
        public AttackSpec Jump { get; set; }

        /// <summary>Counter after a perfect parry (GDD 03 4.8: ×3.0, poise ×2).</summary>
        public AttackSpec Counter { get; set; }

        /// <summary>Finisher (GDD 03 4.10).</summary>
        public AttackSpec Finisher { get; set; }

        /// <summary>Block values (shield in the off hand, otherwise the weapon itself).</summary>
        public BlockSpec Block { get; set; } = BlockSpec.WoodenShield;

        /// <summary>Returns an error text if the moveset is incomplete or a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(BaseDamage >= 0f && WeaponPoise >= 0f))
            {
                return "Weapon '" + Id + "': damage and poise must be 0 or more.";
            }

            if (LightCombo == null || LightCombo.Length == 0)
            {
                return "Weapon '" + Id + "': the light combo needs at least one step.";
            }

            for (int i = 0; i < LightCombo.Length; i++)
            {
                if (LightCombo[i] == null)
                {
                    return "Weapon '" + Id + "': combo step " + (i + 1) + " is missing.";
                }

                string problem = LightCombo[i].Validate();
                if (problem.Length > 0)
                {
                    return problem;
                }
            }

            AttackSpec[] others = { Heavy, Sprint, Jump, Counter, Finisher };
            string[] names = { "heavy", "sprint", "jump", "counter", "finisher" };
            for (int i = 0; i < others.Length; i++)
            {
                if (others[i] == null)
                {
                    return "Weapon '" + Id + "': the " + names[i] + " attack is missing.";
                }

                string problem = others[i].Validate();
                if (problem.Length > 0)
                {
                    return problem;
                }
            }

            return string.Empty;
        }
    }
}
