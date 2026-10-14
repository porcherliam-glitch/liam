using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Action "Ledger-Eintrag" (architecture 7.7 proposal <c>AddLedgerEntry</c>, GDD 02 6.4): writes a decision or consequence
    /// entry into the ledger of a quest - also of a finished quest ("Folgen bisher"). Empty quest = own quest.
    /// </summary>
    [Serializable]
    [TypeMenu("Quest/Ledger-Eintrag", 4)]
    public sealed class AddLedgerEntry : GameAction, IQuestDataReference
    {
        [Tooltip("Quest-ID. Leer = die eigene Quest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Lokale Ledger-ID, z. B. ledger.c2.")]
        [SerializeField] private string entryId = "ledger.c1";

        /// <summary>Creates an empty action.</summary>
        public AddLedgerEntry()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="questId">Quest id (empty = own).</param>
        /// <param name="entryId">Ledger id.</param>
        public AddLedgerEntry(string questId, string entryId)
        {
            this.questId = questId ?? string.Empty;
            this.entryId = entryId ?? string.Empty;
        }

        /// <inheritdoc />
        public string ReferencedQuestId => questId ?? string.Empty;

        /// <inheritdoc />
        public string ReferencedStageId => string.Empty;

        /// <inheritdoc />
        public string ReferencedObjectiveId => string.Empty;

        /// <inheritdoc />
        public string ReferencedLedgerId => entryId ?? string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IQuestService>().AddLedgerEntry(ReferencedQuestId.Length > 0 ? ReferencedQuestId : ctx.SourceId, ReferencedLedgerId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Ledger " + ReferencedLedgerId + (ReferencedQuestId.Length > 0 ? " (" + ReferencedQuestId + ")" : string.Empty);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (ReferencedQuestId.Length > 0)
            {
                report.Mentions(ReferencedQuestId, QuestIds.QuestPrefix);
            }

            if (ReferencedLedgerId.Length == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Ledger-ID ist leer.");
            }
        }
    }
}
