using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Save section <c>npcs</c> (architecture 9.2, load order 70): NPC states (alive, relationship) and hostile NPCs and groups.
    /// TODO (later steps): schedule overrides, location, bounties.
    /// </summary>
    [Preserve]
    public sealed class NpcsDto
    {
        /// <summary>Changed NPC states, sorted by id.</summary>
        public List<NpcStateDto> Npcs = new List<NpcStateDto>();

        /// <summary>Hostile NPC and group ids, sorted.</summary>
        public List<string> Hostile = new List<string>();
    }
}
