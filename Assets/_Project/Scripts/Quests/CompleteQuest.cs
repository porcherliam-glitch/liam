using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Action "Quest abschliessen" (architecture 7.7 <c>CompleteQuest</c>, §6.4): ends an active quest successfully at its
    /// current stage (rewards, follow-up quests). Empty quest = own quest. Prefer success end stages in quest data; this
    /// action is for dialogues and world events.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Quest abschließen", 1)]
    public sealed class CompleteQuest : GameAction, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        /// <summary>Creates the action for the own quest.</summary>
        public CompleteQuest()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        public CompleteQuest(string questId)
        {
            this.questId = questId ?? string.Empty;
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
            ctx.Get<IQuestService>().TryComplete(ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Schließe Quest " + (ReferencedQuestId.Length > 0 ? ReferencedQuestId : "(eigene)") + " ab";
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
