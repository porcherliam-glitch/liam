using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Condition "Ziel erfuellt" (proposal): holds if an objective is fulfilled. Used by branches like "o1 → s50_kampf; o2 →
    /// s50_zerstoert" (GDD 02 11.2) and by conditional actions like "SetzeFlag(tobold_gerettet, o2)". Empty quest = own quest,
    /// empty stage = active stage.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Ziel erfüllt", 2)]
    public sealed class QuestObjectiveDone : Condition, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Lokale Stage-ID. Leer = die aktive Stage.")]
        [SerializeField] private string stageId = string.Empty;

        [Tooltip("Lokale Ziel-ID, z. B. o2.")]
        [SerializeField] private string objectiveId = "o1";

        /// <summary>Creates an empty condition.</summary>
        public QuestObjectiveDone()
        {
        }

        /// <summary>Creates the condition for the own quest and the active stage.</summary>
        /// <param name="objectiveId">Objective id.</param>
        public QuestObjectiveDone(string objectiveId) : this(string.Empty, string.Empty, objectiveId)
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        /// <param name="stageId">Stage id (empty = active).</param>
        /// <param name="objectiveId">Objective id.</param>
        public QuestObjectiveDone(string questId, string stageId, string objectiveId)
        {
            this.questId = questId ?? string.Empty;
            this.stageId = stageId ?? string.Empty;
            this.objectiveId = objectiveId ?? string.Empty;
        }

        /// <inheritdoc />
        public string ReferencedQuestId => questId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedStageId => stageId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedObjectiveId => objectiveId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedLedgerId => string.Empty;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            string quest = ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId;
            return ctx.Get<IQuestService>().IsObjectiveDone(quest, ReferencedStageId, ReferencedObjectiveId);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<ObjectiveProgressed>();
            triggers.On<QuestStageChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Ziel " + (ReferencedStageId.Length > 0 ? ReferencedStageId + "." : string.Empty) + ReferencedObjectiveId + " erfüllt" +
                   (ReferencedQuestId.Length > 0 ? " (" + ReferencedQuestId + ")" : string.Empty);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (ReferencedQuestId.Length > 0)
            {
                report.Mentions(ReferencedQuestId, QuestIds.QuestPrefix);
            }

            if (ReferencedObjectiveId.Length == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Ziel-ID ist leer.");
            }
        }
    }
}
