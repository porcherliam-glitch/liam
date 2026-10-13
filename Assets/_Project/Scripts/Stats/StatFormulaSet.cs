using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// The formulas of all derived stats (architecture 11.5, GDD 03 10.3). A stat with a formula gets its base value
    /// from it; stats without formula keep the base value set by their owner (attributes, level, armor, resistances).
    /// </summary>
    /// <remarks>
    /// <see cref="CreateDefault"/> returns the values of GDD 03 10.3. A balancing asset (ScriptableObject with
    /// <c>[SerializeReference]</c> formulas) can later build a set with tuned values; the collection does not care.
    /// </remarks>
    public sealed class StatFormulaSet
    {
        private readonly StatFormula[] _formulas = new StatFormula[StatIds.Capacity];

        /// <summary>Sets (or replaces) the formula of a derived stat.</summary>
        /// <param name="id">Derived stat.</param>
        /// <param name="formula">Formula; null removes it.</param>
        /// <returns>This set (for chaining).</returns>
        /// <exception cref="ArgumentOutOfRangeException"><paramref name="id"/> is not a valid stat.</exception>
        public StatFormulaSet Set(StatId id, StatFormula formula)
        {
            if (!StatIds.IsValid(id))
            {
                throw new ArgumentOutOfRangeException(nameof(id), "Unknown stat " + id + ".");
            }

            _formulas[(int)id] = formula;
            return this;
        }

        /// <summary>Formula of a stat, or null if its base value is set directly.</summary>
        /// <param name="id">Stat.</param>
        public StatFormula Get(StatId id)
        {
            int index = (int)id;
            return index > 0 && index < _formulas.Length ? _formulas[index] : null;
        }

        /// <summary>True if the stat has a formula.</summary>
        /// <param name="id">Stat.</param>
        public bool IsDerived(StatId id)
        {
            return Get(id) != null;
        }

        /// <summary>
        /// Checks that no derived stat depends on itself, directly or through other derived stats.
        /// </summary>
        /// <param name="problem">Description of the first cycle, or empty.</param>
        /// <returns>True if the dependencies are free of cycles.</returns>
        public bool Validate(out string problem)
        {
            var state = new int[StatIds.Capacity]; // 0 = unvisited, 1 = in progress, 2 = done
            var dependencies = new List<StatId>();
            for (int i = 1; i < _formulas.Length; i++)
            {
                if (_formulas[i] != null && !Visit((StatId)i, state, dependencies, out problem))
                {
                    return false;
                }
            }

            problem = string.Empty;
            return true;
        }

        private bool Visit(StatId id, int[] state, List<StatId> scratch, out string problem)
        {
            int index = (int)id;
            if (state[index] == 2 || _formulas[index] == null)
            {
                problem = string.Empty;
                return true;
            }

            if (state[index] == 1)
            {
                problem = "Derived stat " + id + " depends on itself (formula cycle).";
                return false;
            }

            state[index] = 1;
            scratch.Clear();
            _formulas[index].CollectDependencies(scratch);
            StatId[] dependencies = scratch.ToArray();
            for (int i = 0; i < dependencies.Length; i++)
            {
                if (!StatIds.IsValid(dependencies[i]))
                {
                    problem = "Formula of " + id + " reads the invalid stat " + dependencies[i] + ".";
                    return false;
                }

                if (!Visit(dependencies[i], state, scratch, out problem))
                {
                    return false;
                }
            }

            state[index] = 2;
            problem = string.Empty;
            return true;
        }

        /// <summary>
        /// The derived values of GDD 03 10.3 (without equipment, which arrives as modifiers):
        /// max health/stamina/mana, stamina regeneration, healing and mana factors, spell power, critical chance and
        /// damage, status resistance, carry capacity, poise, luck, movement and attack speed.
        /// </summary>
        public static StatFormulaSet CreateDefault()
        {
            return new StatFormulaSet()
                .Set(StatId.MaxHealth, new LinearStatFormula(StatFormulas.HealthBase, StatId.Constitution, StatFormulas.HealthPerConstitution, StatFormulas.HealthPerLevel))
                .Set(StatId.MaxStamina, new LinearStatFormula(StatFormulas.StaminaBase, StatId.Constitution, StatFormulas.StaminaPerConstitution, StatFormulas.StaminaPerLevel))
                .Set(StatId.MaxMana, new LinearStatFormula(StatFormulas.ManaBase, StatId.Intelligence, StatFormulas.ManaPerIntelligence, StatFormulas.ManaPerLevel))
                .Set(StatId.StaminaRegen, LinearStatFormula.Constant(StatFormulas.StaminaRegenPerSecond))
                .Set(StatId.ManaRegenFactor, new WisdomFactorFormula())
                .Set(StatId.HealingFactor, new WisdomFactorFormula())
                .Set(StatId.SpellPower, new SpellPowerFormula())
                .Set(StatId.CritChance, new LinearStatFormula(StatFormulas.CritChanceBase, StatId.Dexterity, StatFormulas.CritChancePerDexterity))
                .Set(StatId.CritDamage, LinearStatFormula.Constant(StatFormulas.CritDamageBase))
                .Set(StatId.StatusResistance, new LinearStatFormula(0f, StatId.Wisdom, StatFormulas.StatusResistancePerWisdom))
                .Set(StatId.CarryCapacity, new LinearStatFormula(StatFormulas.CarryBase, StatId.Strength, StatFormulas.CarryPerStrength))
                .Set(StatId.Poise, new LinearStatFormula(StatFormulas.PoiseBase, StatId.Constitution, StatFormulas.PoisePerConstitution))
                .Set(StatId.Luck, new LinearStatFormula(0f, StatId.Charisma, StatFormulas.LuckPerCharisma))
                .Set(StatId.MoveSpeed, LinearStatFormula.Constant(1f))
                .Set(StatId.AttackSpeed, LinearStatFormula.Constant(1f));
        }
    }
}
