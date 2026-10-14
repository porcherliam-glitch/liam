using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Action "Quest starten" (architecture 7.7 <c>StartQuest</c>, §6.4), e.g. in a dialogue option or as completion action
    /// (<c>StarteQuest(quest.main.die_graue_gestalt)</c>). Respects the start conditions unless forced.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Quest starten", 0)]
    public sealed class StartQuest : GameAction, IQuestDataReference
    {
        [Tooltip("Quest-ID.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Startbedingungen ignorieren (nur für geskriptete Starts, die sicher passen).")]
        [SerializeField] private bool ignoreStartConditions;

        /// <summary>Creates an empty action.</summary>
        public StartQuest()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="ignoreStartConditions">True to ignore the start conditions.</param>
        public StartQuest(string questId, bool ignoreStartConditions = false)
        {
            this.questId = questId ?? string.Empty;
            this.ignoreStartConditions = ignoreStartConditions;
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
            IQuestService quests = ctx.Get<IQuestService>();
            if (ignoreStartConditions)
            {
                quests.TryStartForced(ReferencedQuestId, ctx.SourceId);
            }
            else
            {
                quests.TryStart(ReferencedQuestId, ctx.SourceId);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Starte Quest " + (ReferencedQuestId.Length > 0 ? ReferencedQuestId : "?");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(questId, QuestIds.QuestPrefix, "Quest-ID");
        }
    }
}
