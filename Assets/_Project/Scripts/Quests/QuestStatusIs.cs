using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Condition "Quest X ist aktiv / abgeschlossen / gescheitert" (architecture 7.7 <c>QuestStatusIs</c>, §6.4), e.g. the
    /// start condition <c>Quest(quest.main.asche_ueber_eichental) = abgeschlossen</c>. Re-evaluated on quest start, end and
    /// availability changes.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Status ist", 0)]
    public sealed class QuestStatusIs : Condition, IQuestDataReference
    {
        [Tooltip("Quest-ID.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Erwarteter Status: Unbekannt (nicht begonnen), Verfügbar, Aktiv, Abgeschlossen, Gescheitert.")]
        [SerializeField] private QuestStatus status = QuestStatus.Completed;

        /// <summary>Creates an empty condition.</summary>
        public QuestStatusIs()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="status">Expected status.</param>
        public QuestStatusIs(string questId, QuestStatus status)
        {
            this.questId = questId ?? string.Empty;
            this.status = status;
        }

        /// <summary>Quest id.</summary>
        public string QuestId => questId ?? string.Empty;

        /// <summary>Expected status.</summary>
        public QuestStatus Status => status;

        /// <inheritdoc />
        public string ReferencedQuestId => QuestId;

        /// <inheritdoc />
        public string ReferencedStageId => string.Empty;

        /// <inheritdoc />
        public string ReferencedObjectiveId => string.Empty;

        /// <inheritdoc />
        public string ReferencedLedgerId => string.Empty;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IQuestService>().GetStatus(QuestId) == status;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<QuestStarted>();
            triggers.On<QuestCompleted>();
            triggers.On<QuestFailed>();
            triggers.On<QuestAvailabilityChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Quest " + (QuestId.Length > 0 ? QuestId : "?") + " = " + status;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(questId, QuestIds.QuestPrefix, "Quest-ID");
        }
    }
}
