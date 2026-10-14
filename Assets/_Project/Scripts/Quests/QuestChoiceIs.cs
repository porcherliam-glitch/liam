using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Condition "Entscheidung ist" (proposal): holds if a decision objective (<see cref="ChooseObjective"/>) of a quest was
    /// answered with the option, e.g. branches after "Waehle(a/b)". Empty quest = own quest.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Entscheidung ist", 3)]
    public sealed class QuestChoiceIs : Condition, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Stage des Wähle-Ziels, z. B. s35_gnade.")]
        [SerializeField] private string stageId = string.Empty;

        [Tooltip("Ziel-ID des Wähle-Ziels, z. B. o1.")]
        [SerializeField] private string objectiveId = "o1";

        [Tooltip("Gewählte Option, z. B. b.")]
        [SerializeField] private string optionId = "a";

        /// <summary>Creates an empty condition.</summary>
        public QuestChoiceIs()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        /// <param name="stageId">Stage of the choose objective.</param>
        /// <param name="objectiveId">Choose objective.</param>
        /// <param name="optionId">Option.</param>
        public QuestChoiceIs(string questId, string stageId, string objectiveId, string optionId)
        {
            this.questId = questId ?? string.Empty;
            this.stageId = stageId ?? string.Empty;
            this.objectiveId = objectiveId ?? string.Empty;
            this.optionId = optionId ?? string.Empty;
        }

        /// <summary>Option id.</summary>
        public string OptionId => optionId ?? string.Empty;

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
            return ctx.Get<IQuestService>().TryGetChoice(quest, QuestIds.StageObjectiveKey(ReferencedStageId, ReferencedObjectiveId), out string chosen) &&
                   chosen == OptionId;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<ObjectiveProgressed>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Entscheidung " + ReferencedStageId + "." + ReferencedObjectiveId + " = " + OptionId;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (ReferencedQuestId.Length > 0)
            {
                report.Mentions(ReferencedQuestId, QuestIds.QuestPrefix);
            }

            if (ReferencedStageId.Length == 0 || ReferencedObjectiveId.Length == 0 || OptionId.Length == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Stage, Ziel und Option müssen gesetzt sein.");
            }
        }
    }
}
