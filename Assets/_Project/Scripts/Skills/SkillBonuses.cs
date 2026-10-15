using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Stats;

namespace Aetherfall.Skills
{
    /// <summary>
    /// Everything the learned nodes of a tree give (GDD 03 11.3–11.5), ready to apply: stat modifiers, the abilities taught,
    /// the ability bonuses (element damage, build-up, upgrades) and the combat bonuses of the warrior. Pure C#.
    /// </summary>
    public sealed class SkillBonuses
    {
        /// <summary>Source id prefix of the stat modifiers (one per node: <c>skill.&lt;node id&gt;</c>).</summary>
        public const string SourcePrefix = "skill:";

        private readonly List<StatModifier> _stats = new List<StatModifier>();
        private readonly HashSet<string> _abilities = new HashSet<string>(System.StringComparer.Ordinal);
        private readonly HashSet<string> _allAbilities = new HashSet<string>(System.StringComparer.Ordinal);

        /// <summary>Stat modifiers.</summary>
        public IReadOnlyList<StatModifier> Stats => _stats;

        /// <summary>Abilities taught by learned active nodes.</summary>
        public IReadOnlyCollection<string> Abilities => _abilities;

        /// <summary>Every ability any active node of the tree teaches (learned or not).</summary>
        public IReadOnlyCollection<string> TreeAbilities => _allAbilities;

        /// <summary>Ability bonuses for the caster.</summary>
        public AbilityModifiers AbilityModifiers { get; } = new AbilityModifiers();

        /// <summary>Damage bonus of light attacks (0.04 = +4 %).</summary>
        public float LightAttackDamage { get; private set; }

        /// <summary>Poise bonus of heavy attacks.</summary>
        public float HeavyAttackPoise { get; private set; }

        /// <summary>Extra block stability (percentage points as share).</summary>
        public float BlockStability { get; private set; }

        /// <summary>Stamina back when a combo finisher hits.</summary>
        public float ComboFinisherStamina { get; private set; }

        /// <summary>Stamina back after a perfect parry.</summary>
        public float ParryStamina { get; private set; }

        /// <summary>Damage bonus of companions.</summary>
        public float CompanionDamage { get; private set; }

        /// <summary>Recomputes everything from a tree and its learned ranks (an empty tree gives nothing).</summary>
        /// <param name="tree">Tree (null = nothing).</param>
        /// <param name="state">Learned ranks.</param>
        public void Compute(SkillTree tree, SkillTreeState state)
        {
            _stats.Clear();
            _abilities.Clear();
            _allAbilities.Clear();
            AbilityModifiers.Clear();
            LightAttackDamage = 0f;
            HeavyAttackPoise = 0f;
            BlockStability = 0f;
            ComboFinisherStamina = 0f;
            ParryStamina = 0f;
            CompanionDamage = 0f;
            if (tree == null || state == null)
            {
                return;
            }

            IReadOnlyList<SkillNode> nodes = tree.Nodes;
            for (int i = 0; i < nodes.Count; i++)
            {
                SkillNode node = nodes[i];
                int rank = state.Rank(node.Id);
                SkillEffect[] effects = node.Effects;
                for (int e = 0; e < effects.Length; e++)
                {
                    SkillEffect effect = effects[e];
                    if (effect == null)
                    {
                        continue;
                    }

                    if (effect.Kind == SkillEffectKind.LearnAbility && effect.AbilityId.Length > 0)
                    {
                        _allAbilities.Add(effect.AbilityId);
                    }

                    if (rank > 0)
                    {
                        Apply(node, effect, rank);
                    }
                }
            }
        }

        private void Apply(SkillNode node, SkillEffect effect, int rank)
        {
            float value = effect.Value * rank;
            switch (effect.Kind)
            {
                case SkillEffectKind.Stat:
                    if (effect.Stat != StatId.None)
                    {
                        string source = SourcePrefix + node.Id;
                        _stats.Add(effect.Percent ? StatModifier.PercentAdd(effect.Stat, value, source) : StatModifier.Flat(effect.Stat, value, source));
                    }

                    break;
                case SkillEffectKind.LearnAbility:
                    if (effect.AbilityId.Length > 0)
                    {
                        _abilities.Add(effect.AbilityId);
                    }

                    break;
                case SkillEffectKind.ElementDamage:
                    AbilityModifiers.AddElementDamage(effect.Element, value);
                    break;
                case SkillEffectKind.ElementBuildup:
                    AbilityModifiers.AddElementBuildup(effect.Element, value);
                    break;
                case SkillEffectKind.AbilityDamage:
                    AbilityModifiers.AllDamage += value;
                    break;
                case SkillEffectKind.AbilityTargets:
                    AbilityModifiers.Upgrade(effect.AbilityId).ExtraTargets += (int)System.Math.Round(value);
                    break;
                case SkillEffectKind.AbilityRadius:
                    AbilityModifiers.Upgrade(effect.AbilityId).ExtraRadius += value;
                    break;
                case SkillEffectKind.AbilityHits:
                    AbilityModifiers.Upgrade(effect.AbilityId).ExtraHits += (int)System.Math.Round(value);
                    break;
                case SkillEffectKind.AbilityPull:
                    AbilityUpgrade pull = AbilityModifiers.Upgrade(effect.AbilityId);
                    pull.PullDistance = System.Math.Max(pull.PullDistance, value);
                    break;
                case SkillEffectKind.AbilityStaminaCost:
                    AbilityModifiers.Upgrade(effect.AbilityId).StaminaCostDelta += value;
                    break;
                case SkillEffectKind.LightAttackDamage:
                    LightAttackDamage += value;
                    break;
                case SkillEffectKind.HeavyAttackPoise:
                    HeavyAttackPoise += value;
                    break;
                case SkillEffectKind.BlockStability:
                    BlockStability += value;
                    break;
                case SkillEffectKind.ComboFinisherStamina:
                    ComboFinisherStamina += value;
                    break;
                case SkillEffectKind.ParryStamina:
                    ParryStamina += value;
                    break;
                case SkillEffectKind.CompanionDamage:
                    CompanionDamage += value;
                    break;
            }
        }
    }
}
