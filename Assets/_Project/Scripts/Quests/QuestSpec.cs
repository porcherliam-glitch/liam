using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Read-only data of one quest as used by the quest service and the validator (all fields of §16.3, GDD 02 4.1 and
    /// architecture 11.7). Created from a <see cref="QuestDefinition"/> asset (<see cref="QuestDefinition.CreateSpec"/>) or in
    /// code with <see cref="QuestSpecBuilder"/> (tests, procedural quests). Stages, conditions, actions and objectives are the
    /// objects of the asset (shared, never changed at run time).
    /// </summary>
    public sealed class QuestSpec
    {
        private readonly Dictionary<string, StageDefinition> _stagesById = new Dictionary<string, StageDefinition>();

        internal QuestSpec(string id)
        {
            Id = id ?? string.Empty;
        }

        /// <summary>Quest id, e.g. <c>quest.side.eichental.woelfe_vom_nordhang</c>.</summary>
        public string Id { get; }

        /// <summary>German title (at most 32 characters). TODO: LocalizedString.</summary>
        public string Title { get; internal set; } = string.Empty;

        /// <summary>German description (1-3 sentences).</summary>
        public string Description { get; internal set; } = string.Empty;

        /// <summary>Category.</summary>
        public QuestCategory Category { get; internal set; } = QuestCategory.Side;

        /// <summary>Traits.</summary>
        public QuestTraits Traits { get; internal set; }

        /// <summary>Twist type of the twist catalogue (GDD 02 1.4).</summary>
        public string TwistType { get; internal set; } = string.Empty;

        /// <summary>Recommended level.</summary>
        public int RecommendedLevel { get; internal set; } = 1;

        /// <summary>Quest giver (NPC or object id), empty for quests without giver.</summary>
        public string GiverId { get; internal set; } = string.Empty;

        /// <summary>Fallback givers in order (if the giver dies, GDD 02 6.6).</summary>
        public IReadOnlyList<string> FallbackGiverIds { get; internal set; } = Array.Empty<string>();

        /// <summary>Turn-in NPC; empty = the giver.</summary>
        public string TurnInNpcId { get; internal set; } = string.Empty;

        /// <summary>How the quest begins.</summary>
        public QuestStartTriggerKind StartTriggerKind { get; internal set; }

        /// <summary>Id of the trigger (dialogue, item, area …).</summary>
        public string StartTriggerId { get; internal set; } = string.Empty;

        /// <summary>Start conditions (null = none).</summary>
        public Condition StartCondition { get; internal set; }

        /// <summary>Start stage; empty = the first stage.</summary>
        public string StartStageId { get; internal set; } = string.Empty;

        /// <summary>Conditional start stages (first true wins, else <see cref="StartStageId"/>).</summary>
        public IReadOnlyList<StageBranch> StartBranches { get; internal set; } = Array.Empty<StageBranch>();

        /// <summary>Stages in editor order.</summary>
        public IReadOnlyList<StageDefinition> Stages { get; private set; } = Array.Empty<StageDefinition>();

        /// <summary>Rewards: actions run on success (XP, gold, items, reputation …).</summary>
        public IReadOnlyList<GameAction> Rewards { get; internal set; } = Array.Empty<GameAction>();

        /// <summary>Follow-up quests.</summary>
        public IReadOnlyList<FollowUpQuest> FollowUps { get; internal set; } = Array.Empty<FollowUpQuest>();

        /// <summary>Repeat mode.</summary>
        public QuestRepeatMode RepeatMode { get; internal set; }

        /// <summary>Cool-down in hours for <see cref="QuestRepeatMode.Cooldown"/>.</summary>
        public float CooldownHours { get; internal set; }

        /// <summary>True if the quest can fail (data for the journal; fail rules and failure end stages do the work).</summary>
        public bool CanFail { get; internal set; }

        /// <summary>Quest-level fail rules (watched while the quest runs).</summary>
        public IReadOnlyList<QuestFailRule> FailRules { get; internal set; } = Array.Empty<QuestFailRule>();

        /// <summary>Region id for filters and budget.</summary>
        public string RegionId { get; internal set; } = string.Empty;

        /// <summary>Deadline in game hours after accepting (trait time-limited; 0 = none). TODO: enforced with the game clock.</summary>
        public float DeadlineHours { get; internal set; }

        /// <summary>Chain id.</summary>
        public string ChainId { get; internal set; } = string.Empty;

        /// <summary>Position in the chain (1-based; 0 = not in a chain).</summary>
        public int ChainPosition { get; internal set; }

        /// <summary>Decision ledger entries.</summary>
        public IReadOnlyList<LedgerEntryDefinition> Ledger { get; internal set; } = Array.Empty<LedgerEntryDefinition>();

        /// <summary>Companion reactions (data only for now).</summary>
        public IReadOnlyList<CompanionReaction> CompanionReactions { get; internal set; } = Array.Empty<CompanionReaction>();

        /// <summary>Expected playtime minute of the first contact (pacing).</summary>
        public int PacingMinute { get; internal set; }

        /// <summary>Scope tier.</summary>
        public QuestScopeTier ScopeTier { get; internal set; }

        /// <summary>Production status.</summary>
        public ContentStatus Status { get; internal set; } = ContentStatus.Draft;

        /// <summary>Author.</summary>
        public string Author { get; internal set; } = string.Empty;

        /// <summary>Word budget (German words).</summary>
        public int WordBudget { get; internal set; }

        /// <summary>Notes.</summary>
        public string Notes { get; internal set; } = string.Empty;

        /// <summary>True if the quest can be repeated.</summary>
        public bool IsRepeatable => RepeatMode != QuestRepeatMode.Never;

        /// <summary>Cool-down in seconds of active playtime before a repeat (daily 24 h, weekly 168 h, cool-down hours).</summary>
        public double CooldownSeconds
        {
            get
            {
                switch (RepeatMode)
                {
                    case QuestRepeatMode.Daily:
                        return 24.0 * 3600.0;
                    case QuestRepeatMode.Weekly:
                        return 168.0 * 3600.0;
                    case QuestRepeatMode.Cooldown:
                        return CooldownHours * 3600.0;
                    default:
                        return 0.0;
                }
            }
        }

        /// <summary>True if the quest has the trait.</summary>
        /// <param name="trait">Trait.</param>
        public bool Has(QuestTraits trait)
        {
            return (Traits & trait) == trait;
        }

        /// <summary>Finds a stage by local id.</summary>
        /// <param name="stageId">Local stage id.</param>
        /// <param name="stage">Stage or null.</param>
        public bool TryGetStage(string stageId, out StageDefinition stage)
        {
            if (stageId == null)
            {
                stage = null;
                return false;
            }

            return _stagesById.TryGetValue(stageId, out stage);
        }

        /// <summary>Finds a ledger entry by local id.</summary>
        /// <param name="entryId">Local ledger id.</param>
        /// <param name="entry">Entry or null.</param>
        public bool TryGetLedgerEntry(string entryId, out LedgerEntryDefinition entry)
        {
            IReadOnlyList<LedgerEntryDefinition> ledger = Ledger;
            for (int i = 0; i < ledger.Count; i++)
            {
                if (ledger[i] != null && ledger[i].Id == entryId)
                {
                    entry = ledger[i];
                    return true;
                }
            }

            entry = null;
            return false;
        }

        /// <summary>The start stage id from the data (without start branches): <see cref="StartStageId"/> or the first stage.</summary>
        public string DefaultStartStageId
        {
            get
            {
                if (StartStageId.Length > 0)
                {
                    return StartStageId;
                }

                for (int i = 0; i < Stages.Count; i++)
                {
                    if (Stages[i] != null)
                    {
                        return Stages[i].Id;
                    }
                }

                return string.Empty;
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Id + " (" + Category + ", " + Stages.Count + " Stages)";
        }

        internal void SetStages(List<StageDefinition> stages)
        {
            Stages = stages;
            _stagesById.Clear();
            for (int i = 0; i < stages.Count; i++)
            {
                StageDefinition stage = stages[i];
                if (stage != null && stage.Id.Length > 0 && !_stagesById.ContainsKey(stage.Id))
                {
                    _stagesById.Add(stage.Id, stage);
                }
            }
        }
    }
}
