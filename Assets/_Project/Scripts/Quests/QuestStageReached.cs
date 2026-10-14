using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Condition "Quest X hat Stage Y erreicht" (architecture 7.7 <c>QuestStageReached</c>, GDD 02 objective type 26): holds
    /// once the quest visited the stage (also after its end). Re-evaluated on <c>QuestStageChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Stage erreicht", 1)]
    public sealed class QuestStageReached : Condition, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Lokale Stage-ID, z. B. s30.")]
        [SerializeField] private string stageId = string.Empty;

        /// <summary>Creates an empty condition.</summary>
        public QuestStageReached()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="questId">Quest id (empty = own quest).</param>
        /// <param name="stageId">Stage id.</param>
        public QuestStageReached(string questId, string stageId)
        {
            this.questId = questId ?? string.Empty;
            this.stageId = stageId ?? string.Empty;
        }

        /// <inheritdoc />
        public string ReferencedQuestId => questId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedStageId => stageId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedObjectiveId => string.Empty;

        /// <inheritdoc />
        public string ReferencedLedgerId => string.Empty;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            string quest = ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId;
            return ctx.Get<IQuestService>().IsStageReached(quest, ReferencedStageId);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<QuestStageChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Quest " + (ReferencedQuestId.Length > 0 ? ReferencedQuestId : "(eigene)") + " hat " + ReferencedStageId + " erreicht";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (ReferencedQuestId.Length > 0)
            {
                report.Mentions(ReferencedQuestId, QuestIds.QuestPrefix);
            }

            if (ReferencedStageId.Length == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Stage-ID ist leer.");
            }
        }
    }
}
