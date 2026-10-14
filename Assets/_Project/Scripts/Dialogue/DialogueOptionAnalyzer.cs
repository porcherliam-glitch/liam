using System.Collections.Generic;
using Aetherfall.Conditions;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Builds the <see cref="DialogueOptionView"/> of one option (GDD 02, 12.2 and 12.4): visibility, selectability, one-time
    /// options, and the markings derived from the option and the nodes it leads to:
    /// <list type="bullet">
    /// <item>target is a check → "[Ueberzeugen 12]" with the preview of the check (deterministic: grey below the threshold)</item>
    /// <item>target is an end node → "[Ende]" (or "[Handel]" / "[Angriff]" by the follow-up); while a jump with return is
    /// pending, an end with the follow-up "Gameplay" returns instead of ending: no "[Ende]" and no diamond, only the
    /// <see cref="DialogueOptionMarks.Return"/> mark (B / Circle chooses it as "Zurueck")</item>
    /// <item>the option's actions and the actions of the lines and action nodes on the straight path behind it (no choice,
    /// check, switch, random or jump in between) → "[80 Gold]", "[Angriff]", "!", star, diamond (<see cref="DialogueBadgeRules"/>)</item>
    /// <item>the straight path ends in a quest exit of the dialogue → diamond</item>
    /// <item>"unumkehrbar" → "[Toeten]" with hold to confirm</item>
    /// </list>
    /// Stateless; evaluates conditions but changes nothing.
    /// </summary>
    public static class DialogueOptionAnalyzer
    {
        /// <summary>Analyses an option; returns null if it is not visible (condition false, or a bribe at an unbribable NPC).</summary>
        /// <param name="context">Run context.</param>
        /// <param name="spec">Dialogue of the choice.</param>
        /// <param name="choice">Choice node.</param>
        /// <param name="option">Option.</param>
        /// <param name="npcId">Conversation partner.</param>
        /// <param name="returnPending">True while a jump with return is pending (an end with "Gameplay" returns instead of ending).</param>
        public static DialogueOptionView Analyze(DialogueRunContext context, DialogueSpec spec, ChoiceNode choice, DialogueOption option, string npcId,
            bool returnPending = false)
        {
            if (option == null)
            {
                return null;
            }

            ConditionContext conditionContext = context.ConditionContextFor(npcId, spec.Id);
            if (!ConditionEvaluator.IsMet(option.VisibleIf, conditionContext))
            {
                return null;
            }

            DialogueOptionMarks marks = DialogueOptionMarks.None;
            bool enabled = true;
            string requirement = string.Empty;
            if (!ConditionEvaluator.IsMet(option.SelectableIf, conditionContext))
            {
                enabled = false;
                if (option.LockedReason.Length > 0)
                {
                    marks |= DialogueOptionMarks.Requirement;
                    requirement = option.LockedReason;
                }
            }

            string optionKey = DialogueIds.OptionKey(spec.Id, choice.Id, option.Id);
            if (context.Memory.IsChosen(optionKey))
            {
                marks |= DialogueOptionMarks.AlreadyChosen;
                if (option.Once)
                {
                    marks |= DialogueOptionMarks.Spent;
                    enabled = false;
                }
            }

            if (option.Irreversible)
            {
                marks |= DialogueOptionMarks.Kill;
            }

            var actions = new List<IReadOnlyList<GameAction>>();
            actions.Add(option.Actions);
            SkillCheckResult check = default;
            if (spec.TryGetNode(option.TargetNodeId, out DialogueNode target))
            {
                if (target is CheckNode checkNode)
                {
                    marks |= DialogueOptionMarks.Check;
                    check = SkillCheckEvaluator.Evaluate(context, checkNode, spec.Id, npcId);
                    if (!context.Rules.IsDiceMode && !check.Success)
                    {
                        enabled = false;
                    }
                    else if (context.Rules.IsDiceMode && check.Remembered && !check.Success)
                    {
                        enabled = false;
                    }
                }
                else if (target is EndNode end)
                {
                    if (returnPending && end.FollowUp == DialogueFollowUp.Gameplay)
                    {
                        // Returns to the dialogue that jumped here: the conversation goes on, so neither "[Ende]" nor a quest exit.
                        marks |= DialogueOptionMarks.Return;
                    }
                    else
                    {
                        marks |= DialogueOptionMarks.End | FollowUpMarks(end.FollowUp);
                        if (spec.IsQuestExit(end.ExitId))
                        {
                            marks |= DialogueOptionMarks.QuestProgress;
                        }
                    }
                }
                else
                {
                    marks |= FollowStraightPath(context, spec, target, actions, returnPending);
                }
            }

            for (int i = 0; i < actions.Count; i++)
            {
                marks |= context.Badges.MarksOf(actions[i]);
            }

            int price = 0;
            if ((marks & DialogueOptionMarks.Bribe) != 0)
            {
                if (IsUnbribable(context, npcId))
                {
                    return null;
                }

                price = BribePrice(context, actions, npcId);
                if (price > 0 && (context.Wallet == null || context.Wallet.Gold < price))
                {
                    enabled = false;
                }
            }

            return new DialogueOptionView(option.Id, option.Text, optionKey, marks, enabled, check, price, requirement, context.Rules.IsDiceMode);
        }

        private static DialogueOptionMarks FollowStraightPath(DialogueRunContext context, DialogueSpec spec, DialogueNode start,
            List<IReadOnlyList<GameAction>> actions, bool returnPending)
        {
            DialogueNode node = start;
            for (int step = 0; step < context.Rules.MaxPathLength && node != null; step++)
            {
                if (node is FlowNode flow)
                {
                    if (flow is LineNode line)
                    {
                        actions.Add(line.Actions);
                    }
                    else if (flow is ActionNode actionNode)
                    {
                        actions.Add(actionNode.Actions);
                    }

                    if (flow.EndsAfter)
                    {
                        return ExitMarks(spec, flow.ExitId, flow.FollowUp, returnPending);
                    }

                    spec.TryGetNode(flow.NextNodeId, out node);
                    continue;
                }

                if (node is EndNode end)
                {
                    return ExitMarks(spec, end.ExitId, end.FollowUp, returnPending);
                }

                break;
            }

            return DialogueOptionMarks.None;
        }

        private static DialogueOptionMarks ExitMarks(DialogueSpec spec, string exitId, DialogueFollowUp followUp, bool returnPending)
        {
            if (returnPending && followUp == DialogueFollowUp.Gameplay)
            {
                // The end returns to the jumping dialogue: its exit is no outcome, so no diamond.
                return DialogueOptionMarks.None;
            }

            DialogueOptionMarks marks = FollowUpMarks(followUp);
            if (spec.IsQuestExit(exitId))
            {
                marks |= DialogueOptionMarks.QuestProgress;
            }

            return marks;
        }

        private static DialogueOptionMarks FollowUpMarks(DialogueFollowUp followUp)
        {
            switch (followUp)
            {
                case DialogueFollowUp.Trade: return DialogueOptionMarks.Trade;
                case DialogueFollowUp.Combat: return DialogueOptionMarks.Combat;
                default: return DialogueOptionMarks.None;
            }
        }

        private static bool IsUnbribable(DialogueRunContext context, string npcId)
        {
            return context.TryGetSpeaker(npcId, out DialogueSpeakerInfo info) && info.Unbribable;
        }

        private static int BribePrice(DialogueRunContext context, List<IReadOnlyList<GameAction>> actions, string npcId)
        {
            int price = 0;
            for (int i = 0; i < actions.Count; i++)
            {
                IReadOnlyList<GameAction> list = actions[i];
                if (list == null)
                {
                    continue;
                }

                for (int j = 0; j < list.Count; j++)
                {
                    if (list[j] is Bribe bribe)
                    {
                        price += bribe.PriceFor(context.Stats, context.Speakers, npcId);
                    }
                }
            }

            return price;
        }
    }
}
