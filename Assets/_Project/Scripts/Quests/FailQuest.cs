using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Action "Quest scheitern lassen" (architecture 7.7 <c>FailQuest</c>, §6.4): lets an active quest fail with a reason.
    /// Empty quest = own quest.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Quest scheitern lassen", 2)]
    public sealed class FailQuest : GameAction, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Grund-ID für Questlog und QuestFailed, z. B. npc_tot.")]
        [SerializeField] private string reasonId = string.Empty;

        /// <summary>Creates the action for the own quest.</summary>
        public FailQuest()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        /// <param name="reasonId">Reason id.</param>
        public FailQuest(string questId, string reasonId)
        {
            this.questId = questId ?? string.Empty;
            this.reasonId = reasonId ?? string.Empty;
        }

        /// <inheritdoc />
        public string ReferencedQuestId => questId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedStageId => string.Empty;

        /// <inheritdoc />
        public string ReferencedObjectiveId => string.Empty;

        /// <inheritdoc />
        public string ReferencedLedgerId => string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IQuestService>().TryFail(ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId, reasonId ?? string.Empty);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Quest " + (ReferencedQuestId.Length > 0 ? ReferencedQuestId : "(eigene)") + " scheitert (" + reasonId + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (ReferencedQuestId.Length > 0)
            {
                report.Mentions(ReferencedQuestId, QuestIds.QuestPrefix);
            }
        }
    }
}
