namespace Aetherfall.Dialogue
{
    /// <summary>
    /// What a dialogue needs to know about a speaker (from the NPC data, <see cref="IDialogueSpeakerDirectory"/>): name and
    /// role for the subtitle (unknown NPCs are called by their role until "Name bekannt", GDD 02 12.7), level for the
    /// intimidation bonus, greed and the tag "unbestechlich" for bribes.
    /// </summary>
    public readonly struct DialogueSpeakerInfo
    {
        /// <summary>Name, e.g. "Harrik".</summary>
        public readonly string Name;

        /// <summary>Role, e.g. "Banditenanfuehrer"; shown while the name is unknown.</summary>
        public readonly string Role;

        /// <summary>True if the player knows the name from the start.</summary>
        public readonly bool NameKnownFromStart;

        /// <summary>Level of the NPC (0 = unknown).</summary>
        public readonly int Level;

        /// <summary>Greed for bribe prices (1 = normal).</summary>
        public readonly float Greed;

        /// <summary>True for NPCs with the tag "unbestechlich": bribe options are not offered.</summary>
        public readonly bool Unbribable;

        /// <summary>Creates the info.</summary>
        /// <param name="name">Name.</param>
        /// <param name="role">Role.</param>
        /// <param name="nameKnownFromStart">True if the name is known from the start.</param>
        /// <param name="level">Level (0 = unknown).</param>
        /// <param name="greed">Greed (1 = normal).</param>
        /// <param name="unbribable">True if bribes are not offered.</param>
        public DialogueSpeakerInfo(string name, string role, bool nameKnownFromStart, int level, float greed, bool unbribable)
        {
            Name = name ?? string.Empty;
            Role = role ?? string.Empty;
            NameKnownFromStart = nameKnownFromStart;
            Level = level;
            Greed = greed <= 0f ? 1f : greed;
            Unbribable = unbribable;
        }
    }
}
