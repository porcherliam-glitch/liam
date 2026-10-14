using System;

namespace Aetherfall.NPC
{
    /// <summary>
    /// The NPC service (architecture 11.11, first part): named NPCs, their relationship to the player (GDD 01 7.5), alive or
    /// dead, hostile groups. All of it is saved (section <c>npcs</c>). Registered by <see cref="NpcInstaller"/>.
    /// </summary>
    /// <remarks>TODO (later steps): daily schedules, overrides by quests (MoveNpc), reactions, barks (architecture 11.11).</remarks>
    public interface INpcService
    {
        /// <summary>Raised when an NPC or group became hostile or peaceful (id, hostile). AI adapters listen to it later.</summary>
        event Action<string, bool> HostilityChanged;

        /// <summary>All NPCs.</summary>
        NpcCatalog Catalog { get; }

        /// <summary>Relationship of an NPC to the player (-100 .. +100; the start value if never changed).</summary>
        /// <param name="npcId">NPC id.</param>
        int GetRelationship(string npcId);

        /// <summary>Changes the relationship (clamped); sends <c>RelationshipChanged</c> if the value changed.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="delta">Change.</param>
        /// <param name="sourceId">Source for the log (quest, dialogue).</param>
        /// <returns>The new value.</returns>
        int ChangeRelationship(string npcId, int delta, string sourceId);

        /// <summary>True if the NPC lives (unknown NPCs count as alive).</summary>
        /// <param name="npcId">NPC id.</param>
        bool IsAlive(string npcId);

        /// <summary>Marks an NPC as dead; sends <c>NPCDied</c> once.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="killerId">Killer (<c>player</c>, NPC id) or empty.</param>
        /// <returns>True if the NPC was alive.</returns>
        bool MarkDead(string npcId, string killerId);

        /// <summary>True if the NPC or group is hostile.</summary>
        /// <param name="id">NPC id or group id (<c>group.…</c>).</param>
        bool IsHostile(string id);

        /// <summary>Makes an NPC or group hostile or peaceful.</summary>
        /// <param name="id">NPC id or group id.</param>
        /// <param name="hostile">True = hostile.</param>
        /// <param name="sourceId">Source for the log.</param>
        void SetHostile(string id, bool hostile, string sourceId);
    }
}
