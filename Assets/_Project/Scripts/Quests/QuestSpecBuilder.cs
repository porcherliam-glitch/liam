using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Fluent construction of a <see cref="QuestSpec"/> in code: used by <see cref="QuestDefinition.CreateSpec"/>, tests,
    /// test fixtures (e.g. "Die Woelfe vom Nordhang") and later procedural quests (architecture 11.7).
    /// </summary>
    public sealed class QuestSpecBuilder
    {
        private readonly QuestSpec _spec;
        private readonly List<StageDefinition> _stages = new List<StageDefinition>();
        private readonly List<StageBranch> _startBranches = new List<StageBranch>();
        private readonly List<GameAction> _rewards = new List<GameAction>();
        private readonly List<FollowUpQuest> _followUps = new List<FollowUpQuest>();
        private readonly List<QuestFailRule> _failRules = new List<QuestFailRule>();
        private readonly List<LedgerEntryDefinition> _ledger = new List<LedgerEntryDefinition>();
        private readonly List<string> _fallbackGivers = new List<string>();
        private readonly List<CompanionReaction> _reactions = new List<CompanionReaction>();
        private bool _built;

        /// <summary>Starts a quest.</summary>
        /// <param name="questId">Quest id.</param>
        public QuestSpecBuilder(string questId)
        {
            _spec = new QuestSpec(questId);
        }

        /// <summary>Title and description.</summary>
        /// <param name="title">German title.</param>
        /// <param name="description">German description.</param>
        public QuestSpecBuilder Title(string title, string description = "")
        {
            _spec.Title = title ?? string.Empty;
            _spec.Description = description ?? string.Empty;
            return this;
        }

        /// <summary>Category and traits.</summary>
        /// <param name="category">Category.</param>
        /// <param name="traits">Traits.</param>
        public QuestSpecBuilder Category(QuestCategory category, QuestTraits traits = QuestTraits.None)
        {
            _spec.Category = category;
            _spec.Traits = traits;
            return this;
        }

        /// <summary>Recommended level, region and twist type.</summary>
        /// <param name="level">Recommended level.</param>
        /// <param name="regionId">Region id.</param>
        /// <param name="twistType">Twist type.</param>
        public QuestSpecBuilder Level(int level, string regionId = "", string twistType = "")
        {
            _spec.RecommendedLevel = level;
            _spec.RegionId = regionId ?? string.Empty;
            _spec.TwistType = twistType ?? string.Empty;
            return this;
        }

        /// <summary>Quest giver, fallback givers and turn-in NPC.</summary>
        /// <param name="giverId">Giver id.</param>
        /// <param name="turnInNpcId">Turn-in NPC (empty = giver).</param>
        /// <param name="fallbackGiverIds">Fallback givers.</param>
        public QuestSpecBuilder Giver(string giverId, string turnInNpcId = "", params string[] fallbackGiverIds)
        {
            _spec.GiverId = giverId ?? string.Empty;
            _spec.TurnInNpcId = turnInNpcId ?? string.Empty;
            if (fallbackGiverIds != null)
            {
                _fallbackGivers.AddRange(fallbackGiverIds);
            }

            return this;
        }

        /// <summary>Start trigger.</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="triggerId">Trigger id.</param>
        public QuestSpecBuilder StartTrigger(QuestStartTriggerKind kind, string triggerId = "")
        {
            _spec.StartTriggerKind = kind;
            _spec.StartTriggerId = triggerId ?? string.Empty;
            return this;
        }

        /// <summary>Start conditions.</summary>
        /// <param name="condition">Condition (use AllOf for several).</param>
        public QuestSpecBuilder StartCondition(Condition condition)
        {
            _spec.StartCondition = condition;
            return this;
        }

        /// <summary>Start stage.</summary>
        /// <param name="stageId">Local stage id.</param>
        public QuestSpecBuilder StartStage(string stageId)
        {
            _spec.StartStageId = stageId ?? string.Empty;
            return this;
        }

        /// <summary>Conditional start stage (checked before the start stage).</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="stageId">Stage.</param>
        public QuestSpecBuilder StartBranch(Condition condition, string stageId)
        {
            _startBranches.Add(new StageBranch(condition, stageId));
            return this;
        }

        /// <summary>Adds a stage.</summary>
        /// <param name="stage">Stage.</param>
        public QuestSpecBuilder Stage(StageDefinition stage)
        {
            _stages.Add(stage);
            return this;
        }

        /// <summary>Adds a stage from a builder.</summary>
        /// <param name="stage">Stage builder.</param>
        public QuestSpecBuilder Stage(StageBuilder stage)
        {
            _stages.Add(stage != null ? stage.Build() : null);
            return this;
        }

        /// <summary>Adds reward actions.</summary>
        /// <param name="actions">Actions.</param>
        public QuestSpecBuilder Rewards(params GameAction[] actions)
        {
            if (actions != null)
            {
                _rewards.AddRange(actions);
            }

            return this;
        }

        /// <summary>Adds a follow-up quest.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="mode">Offer or auto start.</param>
        public QuestSpecBuilder FollowUp(string questId, FollowUpMode mode)
        {
            _followUps.Add(new FollowUpQuest(questId, mode));
            return this;
        }

        /// <summary>Repeat mode.</summary>
        /// <param name="mode">Mode.</param>
        /// <param name="cooldownHours">Hours for <see cref="QuestRepeatMode.Cooldown"/>.</param>
        public QuestSpecBuilder Repeat(QuestRepeatMode mode, float cooldownHours = 0f)
        {
            _spec.RepeatMode = mode;
            _spec.CooldownHours = cooldownHours;
            return this;
        }

        /// <summary>Adds a quest-level fail rule (marks the quest as "can fail").</summary>
        /// <param name="condition">Fail condition.</param>
        /// <param name="targetStageId">Stage to jump to, or empty to fail at once.</param>
        /// <param name="reasonId">Reason id.</param>
        public QuestSpecBuilder FailWhen(Condition condition, string targetStageId, string reasonId)
        {
            _spec.CanFail = true;
            _failRules.Add(new QuestFailRule(condition, targetStageId, reasonId));
            return this;
        }

        /// <summary>Marks the quest as "can fail" (failure end stages).</summary>
        public QuestSpecBuilder CanFail()
        {
            _spec.CanFail = true;
            return this;
        }

        /// <summary>Deadline in game hours.</summary>
        /// <param name="hours">Hours.</param>
        public QuestSpecBuilder Deadline(float hours)
        {
            _spec.DeadlineHours = hours;
            return this;
        }

        /// <summary>Chain id and position.</summary>
        /// <param name="chainId">Chain id.</param>
        /// <param name="position">1-based position.</param>
        public QuestSpecBuilder Chain(string chainId, int position)
        {
            _spec.ChainId = chainId ?? string.Empty;
            _spec.ChainPosition = position;
            return this;
        }

        /// <summary>Adds a decision ledger entry.</summary>
        /// <param name="entryId">Local id (<c>ledger.c1</c>).</param>
        /// <param name="text">German text.</param>
        /// <param name="isConsequence">True for a consequence entry.</param>
        /// <param name="visibleCondition">Visibility condition.</param>
        public QuestSpecBuilder LedgerEntry(string entryId, string text, bool isConsequence = false, Condition visibleCondition = null)
        {
            _ledger.Add(new LedgerEntryDefinition(entryId, text, isConsequence, visibleCondition));
            return this;
        }

        /// <summary>Adds a companion reaction.</summary>
        /// <param name="reaction">Reaction.</param>
        public QuestSpecBuilder Reaction(CompanionReaction reaction)
        {
            _reactions.Add(reaction);
            return this;
        }

        /// <summary>Production data.</summary>
        /// <param name="status">Status.</param>
        /// <param name="tier">Scope tier.</param>
        /// <param name="pacingMinute">Pacing minute.</param>
        /// <param name="author">Author.</param>
        /// <param name="wordBudget">Word budget.</param>
        /// <param name="notes">Notes.</param>
        public QuestSpecBuilder Production(ContentStatus status, QuestScopeTier tier = QuestScopeTier.A, int pacingMinute = 0, string author = "",
                                           int wordBudget = 0, string notes = "")
        {
            _spec.Status = status;
            _spec.ScopeTier = tier;
            _spec.PacingMinute = pacingMinute;
            _spec.Author = author ?? string.Empty;
            _spec.WordBudget = wordBudget;
            _spec.Notes = notes ?? string.Empty;
            return this;
        }

        /// <summary>Returns the spec. The builder cannot be used afterwards.</summary>
        public QuestSpec Build()
        {
            if (_built)
            {
                throw new InvalidOperationException("QuestSpecBuilder.Build was already called for '" + _spec.Id + "'.");
            }

            _built = true;
            _spec.FallbackGiverIds = _fallbackGivers;
            _spec.StartBranches = _startBranches;
            _spec.Rewards = _rewards;
            _spec.FollowUps = _followUps;
            _spec.FailRules = _failRules;
            _spec.Ledger = _ledger;
            _spec.CompanionReactions = _reactions;
            _spec.SetStages(_stages);
            return _spec;
        }

        internal QuestSpecBuilder AddStages(IReadOnlyList<StageDefinition> stages)
        {
            if (stages != null)
            {
                for (int i = 0; i < stages.Count; i++)
                {
                    _stages.Add(stages[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddStartBranches(IReadOnlyList<StageBranch> branches)
        {
            if (branches != null)
            {
                for (int i = 0; i < branches.Count; i++)
                {
                    _startBranches.Add(branches[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddFollowUps(IReadOnlyList<FollowUpQuest> followUps)
        {
            if (followUps != null)
            {
                for (int i = 0; i < followUps.Count; i++)
                {
                    _followUps.Add(followUps[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddFailRules(IReadOnlyList<QuestFailRule> rules)
        {
            if (rules != null)
            {
                for (int i = 0; i < rules.Count; i++)
                {
                    _failRules.Add(rules[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddLedger(IReadOnlyList<LedgerEntryDefinition> entries)
        {
            if (entries != null)
            {
                for (int i = 0; i < entries.Count; i++)
                {
                    _ledger.Add(entries[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddReactions(IReadOnlyList<CompanionReaction> reactions)
        {
            if (reactions != null)
            {
                for (int i = 0; i < reactions.Count; i++)
                {
                    _reactions.Add(reactions[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder AddRewards(IReadOnlyList<GameAction> rewards)
        {
            if (rewards != null)
            {
                for (int i = 0; i < rewards.Count; i++)
                {
                    _rewards.Add(rewards[i]);
                }
            }

            return this;
        }

        internal QuestSpecBuilder SetCanFail(bool canFail)
        {
            _spec.CanFail = canFail;
            return this;
        }
    }
}
