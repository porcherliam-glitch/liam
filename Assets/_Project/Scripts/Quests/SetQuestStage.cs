using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Action "Quest-Stage setzen" (architecture 7.7 <c>SetQuestStage</c>): jumps an active quest to a stage, e.g. from a
    /// dialogue that skips steps. Empty quest = own quest.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Stage setzen", 3)]
    public sealed class SetQuestStage : GameAction, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Lokale Stage-ID.")]
        [SerializeField] private string stageId = string.Empty;

        /// <summary>Creates an empty action.</summary>
        public SetQuestStage()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        /// <param name="stageId">Stage id.</param>
        public SetQuestStage(string questId, string stageId)
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
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IQuestService>().TrySetStage(ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId, ReferencedStageId, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Setze Quest " + (ReferencedQuestId.Length > 0 ? ReferencedQuestId : "(eigene)") + " auf " + ReferencedStageId;
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
