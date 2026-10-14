using System;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Reaction of a companion to an outcome (GDD 02, 4.1 proposal "Begleiter-Reaktionen"): loyalty change and comment when
    /// the quest ends at <see cref="EndStageId"/>. Data only for now. TODO (companions step): apply the loyalty change and show
    /// the comment.
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
