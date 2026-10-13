namespace Aetherfall.Inventory
{
    /// <summary>
    /// Seeds of loot rolls (GDD 04 5.4 step 3): <c>Hash(Spielstand-Seed, Quell-ID, Oeffnungszaehler)</c>, so reloading a save
    /// does not change what a source drops (no save scumming). FNV-1a 64 over the id, mixed with SplitMix64.
    /// </summary>
    public static class LootSeeds
    {
        private const ulong FnvOffset = 14695981039346656037UL;
        private const ulong FnvPrime = 1099511628211UL;

        /// <summary>Combines save seed, source id and counter into one seed.</summary>
        /// <param name="saveSeed">Seed of the save game.</param>
        /// <param name="sourceId">Id of the source (chest id, enemy unique id).</param>
        /// <param name="counter">Opening or roll counter.</param>
        public static ulong Combine(ulong saveSeed, string sourceId, long counter)
        {
            ulong hash = FnvOffset;
            if (sourceId != null)
            {
                for (int i = 0; i < sourceId.Length; i++)
                {
                    hash ^= sourceId[i];
                    hash = unchecked(hash * FnvPrime);
                }
            }

            return Mix(Mix(saveSeed ^ hash) ^ unchecked((ulong)counter));
        }

        /// <summary>SplitMix64 finalizer (good avalanche for neighbouring inputs).</summary>
        /// <param name="value">Input.</param>
        public static ulong Mix(ulong value)
        {
            unchecked
            {
                value += 0x9E3779B97F4A7C15UL;
                value = (value ^ (value >> 30)) * 0xBF58476D1CE4E5B9UL;
                value = (value ^ (value >> 27)) * 0x94D049BB133111EBUL;
                return value ^ (value >> 31);
            }
        }
    }
}
