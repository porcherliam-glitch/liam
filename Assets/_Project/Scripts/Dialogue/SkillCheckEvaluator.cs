using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Stats;
using Aetherfall.Utilities;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Evaluates a <see cref="CheckNode"/> for the current player (GDD 02, 12.3): attribute, rank, situation modifiers whose
    /// condition holds, level advantage over the conversation partner, for persuasion the relationship of the partner (friendly +2,
    /// trusted +4, dislike -2, enemy -4), then <see cref="SkillCheckRules"/>. A remembered result
    /// (node option "Ergebnis merken") is returned unchanged. Used for the preview on options and for the check itself, so both
    /// always agree. Stateless; does not store anything.
    /// </summary>
    public static class SkillCheckEvaluator
    {
        /// <summary>Evaluates a check.</summary>
        /// <param name="context">Run context.</param>
        /// <param name="node">Check node.</param>
        /// <param name="dialogueId">Dialogue of the node.</param>
        /// <param name="npcId">Conversation partner (level, seed).</param>
        public static SkillCheckResult Evaluate(DialogueRunContext context, CheckNode node, string dialogueId, string npcId)
        {
            int threshold = SkillCheckRules.ThresholdOf(node.Difficulty);
            IDialogueCheckStats stats = context.Stats;
            int charisma = stats != null ? stats.GetAttribute(StatId.Charisma) : PlayerStatsCheckSource.DefaultAttribute;
            int strength = stats != null ? stats.GetAttribute(StatId.Strength) : PlayerStatsCheckSource.DefaultAttribute;
            StatId attribute = SkillCheckRules.AttributeOf(node.CheckType, charisma, strength);
            int attributeValue = attribute == StatId.Strength ? strength : charisma;
            int rank = stats != null ? stats.GetSkillRank(node.CheckType) : 0;

            int situation = 0;
            ConditionContext conditionContext = context.ConditionContextFor(npcId, dialogueId);
            for (int i = 0; i < node.Modifiers.Count; i++)
            {
                CheckModifier modifier = node.Modifiers[i];
                if (modifier != null && ConditionEvaluator.IsMet(modifier.Condition, conditionContext))
                {
                    situation += modifier.Bonus;
                }
            }

            bool knownSpeaker = context.TryGetSpeaker(npcId, out DialogueSpeakerInfo info);
            if (node.LevelAdvantage)
            {
                situation += SkillCheckRules.LevelBonus(stats != null ? stats.PlayerLevel : 1, knownSpeaker ? info.Level : 0);
            }

            if (node.CheckType == SkillCheckType.Persuade && knownSpeaker)
            {
                situation += SkillCheckRules.RelationshipBonus(info.Relationship);
            }

            int clamped = SkillCheckRules.ClampSituation(situation);
            int value = SkillCheckRules.Value(attributeValue, rank, situation);
            if (node.RememberResult && context.Memory.TryGetCheck(DialogueIds.NodeKey(dialogueId, node.Id), out bool stored))
            {
                return new SkillCheckResult(node.CheckType, threshold, value, attribute, clamped, stored, 0, stored ? 1f : 0f, true);
            }

            if (context.Rules.IsDiceMode)
            {
                var random = new Pcg32Random(DialogueSeeds.For(npcId, context.CurrentDay, dialogueId, node.Id));
                int roll = 1 + random.Range(0, SkillCheckRules.DieFaces);
                bool diceSuccess = SkillCheckRules.DiceSucceeds(roll, value, threshold);
                return new SkillCheckResult(node.CheckType, threshold, value, attribute, clamped, diceSuccess, roll,
                    SkillCheckRules.DiceChance(value, threshold), false);
            }

            bool success = SkillCheckRules.Succeeds(value, threshold);
            return new SkillCheckResult(node.CheckType, threshold, value, attribute, clamped, success, 0, success ? 1f : 0f, false);
        }
    }
}
