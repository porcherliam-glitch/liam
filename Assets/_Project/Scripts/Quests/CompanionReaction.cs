using System;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Reaction of a companion to an outcome (GDD 02, 4.1 proposal "Begleiter-Reaktionen"): loyalty change and comment when
    /// the quest ends at <see cref="EndStageId"/>. The quest service applies it when the companion is in the group (world flag
    /// <c>flag.begleiter.&lt;name&gt;.in_gruppe</c>) and publishes <c>CompanionReacted</c> for the notice.
    /// </summary>
    [Serializable]
    public sealed class CompanionReaction
    {
        [Tooltip("Begleiter-ID, z. B. npc.begleiter.maren_falkenried.")]
        [IdRef("npc.begleiter.")] [SerializeField] private string companionId = string.Empty;

        [Tooltip("Endstage (Ausgang), z. B. s50_zerstoert.")]
        [SerializeField] private string endStageId = string.Empty;

        [Tooltip("Loyalitätsänderung.")]
        [SerializeField] private int loyaltyDelta;

        [Tooltip("Kommentar des Begleiters (Bark). TODO: LocalizedString.")]
        [SerializeField] private string comment = string.Empty;

        /// <summary>Creates an empty reaction (inspector).</summary>
        public CompanionReaction()
        {
        }

        /// <summary>Creates a reaction (generator).</summary>
        /// <param name="companionId">Companion id, e.g. <c>npc.begleiter.maren_falkenried</c>.</param>
        /// <param name="endStageId">End stage (empty = every successful end).</param>
        /// <param name="loyaltyDelta">Loyalty change.</param>
        /// <param name="comment">Comment of the companion.</param>
        public CompanionReaction(string companionId, string endStageId, int loyaltyDelta, string comment)
        {
            this.companionId = companionId ?? string.Empty;
            this.endStageId = endStageId ?? string.Empty;
            this.loyaltyDelta = loyaltyDelta;
            this.comment = comment ?? string.Empty;
        }

        /// <summary>Companion id.</summary>
        public string CompanionId => companionId ?? string.Empty;

        /// <summary>End stage.</summary>
        public string EndStageId => endStageId ?? string.Empty;

        /// <summary>Loyalty change.</summary>
        public int LoyaltyDelta => loyaltyDelta;

        /// <summary>Comment.</summary>
        public string Comment => comment ?? string.Empty;
    }
}
