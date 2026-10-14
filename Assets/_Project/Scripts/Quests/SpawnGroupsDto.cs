using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Save section <c>spawners</c> (architecture 9.2, load order 88): enemy groups that quest actions switched on and groups
    /// that are already defeated (spawner ids, sorted).
    /// </summary>
    /// <remarks>
    /// Architecture 9.7 also plans dead masks, clear times and boss states for this section; they come with the open world and
    /// are added as new fields (old saves simply lack them).
    /// </remarks>
    [Preserve]
    public sealed class SpawnGroupsDto
    {
        /// <summary>Activated quest groups.</summary>
        public List<string> Activated = new List<string>();

        /// <summary>Defeated quest groups.</summary>
        public List<string> Cleared = new List<string>();
    }
}
