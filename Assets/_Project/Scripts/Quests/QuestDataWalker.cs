using System;
using System.Collections.Generic;
using Aetherfall.Conditions;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Visits every condition, action and objective of a quest, including nested ones (AND/OR/NOT, "n of m", "if - then",
    /// bonus actions, visibility conditions, condition objectives). Used by the validator (references, decisions, flags) and
    /// later by the flag browser. Stateless.
    /// </summary>
    public static class QuestDataWalker
    {
        /// <summary>Visits all data objects of a quest.</summary>
        /// <param name="quest">Quest.</param>
        /// <param name="visit">Called with the object (Condition, GameAction or QuestObjective) and its stage (null = quest level).</param>
        public static void Walk(QuestSpec quest, Action<object, StageDefinition> visit)
        {
            if (quest == null || visit == null)
            {
                return;
            }

            WalkCondition(quest.StartCondition, null, visit);
            for (int i = 0; i < quest.StartBranches.Count; i++)
            {
                if (quest.StartBranches[i] != null)
                {
                    WalkCondition(quest.StartBranches[i].Condition, null, visit);
                }
            }

            WalkActions(quest.Rewards, null, visit);
            WalkRules(quest.FailRules, null, visit);
            for (int i = 0; i < quest.Ledger.Count; i++)
            {
                if (quest.Ledger[i] != null)
                {
                    WalkCondition(quest.Ledger[i].VisibleCondition, null, visit);
                }
            }

            for (int s = 0; s < quest.Stages.Count; s++)
            {
                StageDefinition stage = quest.Stages[s];
                if (stage == null)
                {
                    continue;
                }

                WalkActions(stage.OnStart, stage, visit);
                WalkActions(stage.OnComplete, stage, visit);
                for (int i = 0; i < stage.Branches.Count; i++)
                {
                    if (stage.Branches[i] != null)
                    {
                        WalkCondition(stage.Branches[i].Condition, stage, visit);
                    }
                }

                WalkRules(stage.FailRules, stage, visit);
                for (int i = 0; i < stage.Objectives.Count; i++)
                {
                    QuestObjective objective = stage.Objectives[i];
                    if (objective == null)
                    {
                        continue;
                    }

                    visit(objective, stage);
                    WalkCondition(objective.VisibleCondition, stage, visit);
                    WalkActions(objective.OnCompletedActions, stage, visit);
                    if (objective is ConditionObjective conditionObjective)
                    {
                        WalkCondition(conditionObjective.Condition, stage, visit);
                    }
                }
            }
        }

        /// <summary>Visits a condition and its children.</summary>
        /// <param name="condition">Condition (null is skipped).</param>
        /// <param name="stage">Stage context.</param>
        /// <param name="visit">Callback.</param>
        public static void WalkCondition(Condition condition, StageDefinition stage, Action<object, StageDefinition> visit)
        {
            if (condition == null)
            {
                return;
            }

            visit(condition, stage);
            switch (condition)
            {
                case AllOf all:
                    WalkConditions(all.Conditions, stage, visit);
                    break;
                case AnyOf any:
                    WalkConditions(any.Conditions, stage, visit);
                    break;
                case AtLeastNOf some:
                    WalkConditions(some.Conditions, stage, visit);
                    break;
                case Not not:
                    WalkCondition(not.Inner, stage, visit);
                    break;
            }
        }

        /// <summary>Visits actions and their children.</summary>
        /// <param name="actions">Actions (null entries are skipped).</param>
        /// <param name="stage">Stage context.</param>
        /// <param name="visit">Callback.</param>
        public static void WalkActions(IReadOnlyList<GameAction> actions, StageDefinition stage, Action<object, StageDefinition> visit)
        {
            if (actions == null)
            {
                return;
            }

            for (int i = 0; i < actions.Count; i++)
            {
                GameAction action = actions[i];
                if (action == null)
                {
                    continue;
                }

                visit(action, stage);
                if (action is ConditionalAction conditional)
                {
                    WalkCondition(conditional.Condition, stage, visit);
                    WalkActions(conditional.Then, stage, visit);
                    WalkActions(conditional.Else, stage, visit);
                }
            }
        }

        private static void WalkConditions(IReadOnlyList<Condition> conditions, StageDefinition stage, Action<object, StageDefinition> visit)
        {
            for (int i = 0; i < conditions.Count; i++)
            {
                WalkCondition(conditions[i], stage, visit);
            }
        }

        private static void WalkRules(IReadOnlyList<QuestFailRule> rules, StageDefinition stage, Action<object, StageDefinition> visit)
        {
            for (int i = 0; i < rules.Count; i++)
            {
                if (rules[i] != null)
                {
                    WalkCondition(rules[i].Condition, stage, visit);
                }
            }
        }
    }
}
