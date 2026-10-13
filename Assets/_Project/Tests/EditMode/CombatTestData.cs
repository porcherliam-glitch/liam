using Aetherfall.Combat;
using Aetherfall.Stats;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Test data of the combat tests: a one-handed sword like the test ground asset (light hit 0.2 / 0.12 / 0.5 s, combo
    /// window at 0.45 s, 4 steps, heavy 0.45 / 0.15 / 0.7 s) and a stamina pool of 100.
    /// </summary>
    public static class CombatTestData
    {
        /// <summary>One-handed sword with the full moveset.</summary>
        public static WeaponSpec CreateSword()
        {
            var combo = new AttackSpec[4];
            for (int i = 0; i < combo.Length; i++)
            {
                AttackSpec step = AttackSpec.Create("leicht_" + (i + 1), 0.2f, 0.12f, 0.5f);
                step.ComboWindowStartSeconds = 0.45f;
                step.StaminaCost = 12f;
                combo[i] = step;
            }

            combo[3].Kind = AttackKind.ComboFinisher;
            combo[3].DamageMultiplier = 1.2f;
            combo[3].PoiseMultiplier = 1.5f;

            AttackSpec heavy = AttackSpec.Create("schwer", 0.45f, 0.15f, 0.7f);
            heavy.Kind = AttackKind.Heavy;
            heavy.CancelOnlyInRecovery = true;
            heavy.DamageMultiplier = 1.5f;
            heavy.PoiseMultiplier = 1.5f;
            heavy.StaminaCost = 24f;
            heavy.ComboWindowStartSeconds = 10f;

            AttackSpec sprint = AttackSpec.Create("sprint", 0.2f, 0.18f, 0.55f);
            sprint.Kind = AttackKind.Sprint;
            sprint.StaminaCost = 18f;
            sprint.LungeDistance = 2f;
            sprint.ComboWindowStartSeconds = 10f;

            AttackSpec jump = AttackSpec.Create("sprung", 0.15f, 0.2f, 0.45f);
            jump.Kind = AttackKind.Jump;
            jump.StaminaCost = 18f;
            jump.ComboWindowStartSeconds = 10f;

            AttackSpec counter = AttackSpec.Create("konter", 0.12f, 0.15f, 0.45f);
            counter.Kind = AttackKind.Counter;
            counter.DamageMultiplier = 3f;
            counter.ComboWindowStartSeconds = 10f;

            AttackSpec finisher = AttackSpec.Create("finisher", 0.8f, 0.1f, 0.7f);
            finisher.Kind = AttackKind.Finisher;
            finisher.ComboWindowStartSeconds = 10f;

            return new WeaponSpec
            {
                Id = "test.schwert",
                BaseDamage = 50f,
                LightCombo = combo,
                Heavy = heavy,
                Sprint = sprint,
                Jump = jump,
                Counter = counter,
                Finisher = finisher,
                Block = BlockSpec.WoodenShield
            };
        }

        /// <summary>Stamina pool of 100 with the stamina rules (the tests never tick it, so it does not regenerate).</summary>
        public static ResourcePool CreateStamina(float max = 100f)
        {
            return new ResourcePool(max, ResourcePoolSettings.Stamina);
        }
    }
}
