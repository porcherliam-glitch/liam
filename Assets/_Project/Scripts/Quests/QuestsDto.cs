using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Save section <c>quests</c> (architecture 9.2, load order 100): all started quests including the decision ledger, the
    /// focus quest, and saved quests whose definition is missing (kept unchanged, no data loss).
    /// </summary>
    [Preserve]
    public sealed class QuestsDto
    {
        /// <summary>Started quests in start order.</summary>
        public List<QuestInstanceDto> Instances = new List<QuestInstanceDto>();

        /// <summary>Focus quest id or empty.</summary>
        public string FocusQuestId = string.Empty;
    }
}
