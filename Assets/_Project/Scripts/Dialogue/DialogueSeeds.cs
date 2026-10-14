namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Seeds of random nodes and dice checks (architecture 11.8: "Seed = Hash(NPC-ID, Spieltag)" plus dialogue and node, so two
    /// random nodes of one NPC differ). FNV-1a 64 over the UTF-16 code units: stable across platforms and runs (never
    /// <c>string.GetHashCode</c>, which changes per process).
    /// </summary>
    public static class DialogueSeeds
    {
        private const ulong OffsetBasis = 14695981039346656037UL;
        private const ulong Prime = 1099511628211UL;

        /// <summary>Seed for a node.</summary>
        /// <param name="npcId">Conversation partner.</param>
        /// <param name="day">Game day.</param>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id.</param>
        public static ulong For(string npcId, int day, string dialogueId, string nodeId)
        {
            ulong hash = OffsetBasis;
            hash = Mix(hash, npcId);
            hash = Mix(hash, "|");
            hash = MixInt(hash, day);
            hash = Mix(hash, "|");
            hash = Mix(hash, dialogueId);
            hash = Mix(hash, "|");
            hash = Mix(hash, nodeId);
            return hash;
        }

        private static ulong Mix(ulong hash, string text)
        {
            if (text == null)
            {
                return hash;
            }

            for (int i = 0; i < text.Length; i++)
            {
                hash ^= text[i];
                hash *= Prime;
            }

            return hash;
        }

        private static ulong MixInt(ulong hash, int value)
        {
            unchecked
            {
                uint bits = (uint)value;
                for (int i = 0; i < 4; i++)
                {
                    hash ^= (bits >> (8 * i)) & 0xFF;
                    hash *= Prime;
                }
            }

            return hash;
        }
    }
}
