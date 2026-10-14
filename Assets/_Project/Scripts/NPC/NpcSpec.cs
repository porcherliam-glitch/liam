namespace Aetherfall.NPC
{
    /// <summary>
    /// Read-only form of an NPC used by the NPC service and the dialogues (pure C#, built by
    /// <see cref="NpcDefinition.CreateSpec"/> or directly in tests).
    /// </summary>
    public sealed class NpcSpec
    {
        /// <summary>Creates the spec.</summary>
        /// <param name="id">NPC id, e.g. <c>npc.eichental.banditenfuehrer_harrik</c>.</param>
        /// <param name="name">Name, e.g. "Harrik".</param>
        /// <param name="role">Role, e.g. "Banditenanfuehrer" (shown until the name is known).</param>
        /// <param name="nameKnownFromStart">True if the player knows the name from the start.</param>
        /// <param name="defaultDialogueId">Dialogue when the player talks to the NPC.</param>
        /// <param name="level">Level (intimidation bonus; 0 = unknown).</param>
        /// <param name="greed">Greed for bribes (1 = normal).</param>
        /// <param name="unbribable">True for NPCs with the tag "unbestechlich".</param>
        /// <param name="startRelationship">Relationship at the start of a new game (-100 .. +100).</param>
        public NpcSpec(string id, string name, string role, bool nameKnownFromStart, string defaultDialogueId, int level, float greed, bool unbribable,
            int startRelationship)
        {
            Id = id ?? string.Empty;
            Name = name ?? string.Empty;
            Role = role ?? string.Empty;
            NameKnownFromStart = nameKnownFromStart;
            DefaultDialogueId = defaultDialogueId ?? string.Empty;
            Level = level < 0 ? 0 : level;
            Greed = greed <= 0f ? 1f : greed;
            Unbribable = unbribable;
            StartRelationship = RelationshipRules.Clamp(startRelationship);
        }

        /// <summary>NPC id.</summary>
        public string Id { get; }

        /// <summary>Name.</summary>
        public string Name { get; }

        /// <summary>Role.</summary>
        public string Role { get; }

        /// <summary>True if the name is known from the start.</summary>
        public bool NameKnownFromStart { get; }

        /// <summary>Dialogue when the player talks to the NPC.</summary>
        public string DefaultDialogueId { get; }

        /// <summary>Level (0 = unknown).</summary>
        public int Level { get; }

        /// <summary>Greed for bribes.</summary>
        public float Greed { get; }

        /// <summary>True if bribes are not offered.</summary>
        public bool Unbribable { get; }

        /// <summary>Relationship at the start.</summary>
        public int StartRelationship { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return "NpcSpec(" + Id + ", " + Name + ")";
        }
    }
}
