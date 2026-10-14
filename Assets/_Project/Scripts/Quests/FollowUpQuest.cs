using System;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>A follow-up quest (GDD 02, 4.1 "Folgequests"): offered or started automatically after a successful end.</summary>
    [Serializable]
    public sealed class FollowUpQuest
    {
        [Tooltip("Quest-ID der Folgequest.")]
        [IdRef("quest.")] [SerializeField] private string questId = string.Empty;

        [Tooltip("Angeboten (über ihre Startbedingungen) oder automatisch gestartet.")]
        [SerializeField] private FollowUpMode mode = FollowUpMode.Offer;

        /// <summary>Creates an empty entry.</summary>
        public FollowUpQuest()
        {
        }

        /// <summary>Creates an entry.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="mode">Mode.</param>
        public FollowUpQuest(string questId, FollowUpMode mode)
        {
            this.questId = questId ?? string.Empty;
            this.mode = mode;
        }

        /// <summary>Quest id.</summary>
        public string QuestId => questId ?? string.Empty;

        /// <summary>Mode.</summary>
        public FollowUpMode Mode => mode;
    }
}
