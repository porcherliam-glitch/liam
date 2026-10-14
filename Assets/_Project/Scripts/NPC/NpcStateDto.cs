using UnityEngine.Scripting;

namespace Aetherfall.NPC
{
    /// <summary>State of one NPC in the save section <c>npcs</c> (only NPCs whose state differs from the start).</summary>
    [Preserve]
    public sealed class NpcStateDto
    {
        /// <summary>NPC id.</summary>
        public string Id = string.Empty;

        /// <summary>Relationship (-100 .. +100).</summary>
        public int Relationship;

        /// <summary>True if alive.</summary>
        public bool Alive = true;
    }
}
