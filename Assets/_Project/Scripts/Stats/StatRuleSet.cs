using System;

namespace Aetherfall.Stats
{
    /// <summary>
    /// Soft caps and hard limits of every stat (GDD 03 10.1 and 10.5) for one kind of character. Pure data, immutable
    /// after creation; shared by all collections of the same kind.
    /// </summary>
    /// <remarks>
    /// Attributes are clamped to 1–60 (hard cap). Their soft cap of 40 is not applied to the value itself but through the
    /// effective points <see cref="StatFormulas.EffectivePoints"/> (GDD 03 10.1), otherwise it would count twice.
    /// </remarks>
    public sealed class StatRuleSet
    {
        /// <summary>Lowest attribute value (GDD 03 10.1).</summary>
        public const float AttributeMin = 1f;

        /// <summary>Hard cap of attributes (GDD 03 10.1).</summary>
        public const float AttributeMax = 60f;

        /// <summary>Highest character level (GDD 03 12.1).</summary>
        public const float LevelMax = 80f;

        /// <summary>Lowest resistance of every damage type: −100 % = double damage (GDD 03 8.2 step 7).</summary>
        public const float ResistanceMin = -1f;

        /// <summary>Highest resistance of the player and companions (GDD 03 10.5).</summary>
        public const float PlayerResistanceMax = 0.75f;

        /// <summary>Highest resistance of enemies (GDD 03 8.2 step 7).</summary>
        public const float EnemyResistanceMax = 0.9f;

        private readonly StatRule[] _rules;

        private StatRuleSet(StatRule[] rules)
        {
            _rules = rules;
        }

        /// <summary>Rule of a stat; <see cref="StatRule.Unbounded"/> for unknown ids.</summary>
        /// <param name="id">Stat.</param>
        public StatRule Get(StatId id)
        {
            int index = (int)id;
            return index >= 0 && index < _rules.Length ? _rules[index] : StatRule.Unbounded;
        }

        /// <summary>Creates the rules for a kind of character.</summary>
        /// <param name="kind">Player, companion or enemy.</param>
        public static StatRuleSet Create(StatActorKind kind)
        {
            bool enemy = kind == StatActorKind.Enemy;
            var rules = new StatRule[StatIds.Capacity];
            for (int i = 0; i < rules.Length; i++)
            {
                rules[i] = StatRule.AtLeast(0f);
            }

            for (int i = 0; i < StatIds.Attributes.Length; i++)
            {
                rules[(int)StatIds.Attributes[i]] = enemy ? StatRule.AtLeast(0f) : StatRule.Range(AttributeMin, AttributeMax);
            }

            rules[(int)StatId.Level] = StatRule.Range(1f, enemy ? float.PositiveInfinity : LevelMax);
            rules[(int)StatId.MaxHealth] = StatRule.AtLeast(1f);
            rules[(int)StatId.CritChance] = new StatRule(0f, 0.75f, 0.5f);
            rules[(int)StatId.CritDamage] = StatRule.Range(1f, 3f);
            rules[(int)StatId.CooldownReduction] = new StatRule(0f, 0.4f, 0.3f);
            rules[(int)StatId.MoveSpeed] = StatRule.Range(0.4f, 1.3f);
            rules[(int)StatId.AttackSpeed] = StatRule.Range(0.7f, 1.3f);
            rules[(int)StatId.ArmorPenetration] = StatRule.Range(0f, 1f);
            rules[(int)StatId.DamageBonus] = StatRule.AtLeast(-1f);
            rules[(int)StatId.StatusResistance] = enemy ? StatRule.AtLeast(0f) : StatRule.Range(0f, 200f);
            float resistanceMax = enemy ? EnemyResistanceMax : PlayerResistanceMax;
            for (int id = (int)StatId.ResistSlash; id <= (int)StatId.ResistAether; id++)
            {
                rules[id] = StatRule.Range(ResistanceMin, resistanceMax);
            }

            return new StatRuleSet(rules);
        }

        /// <summary>Creates a rule set with custom rules for some stats (tests, special characters); others as <paramref name="kind"/>.</summary>
        /// <param name="kind">Base rules.</param>
        /// <param name="overrides">Pairs of stat and rule that replace the base rules.</param>
        public static StatRuleSet CreateWithOverrides(StatActorKind kind, params (StatId Stat, StatRule Rule)[] overrides)
        {
            StatRuleSet baseSet = Create(kind);
            var rules = (StatRule[])baseSet._rules.Clone();
            if (overrides != null)
            {
                foreach ((StatId stat, StatRule rule) in overrides)
                {
                    int index = (int)stat;
                    if (index <= 0 || index >= rules.Length)
                    {
                        throw new ArgumentOutOfRangeException(nameof(overrides), "Unknown stat " + stat + ".");
                    }

                    rules[index] = rule;
                }
            }

            return new StatRuleSet(rules);
        }
    }
}
