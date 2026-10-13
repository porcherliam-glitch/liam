using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Flags of a loot table entry (GDD 04 5.1): guaranteed, ignores luck. Stored in assets as bit mask: never renumber.
    /// TODO: <c>einmalig_je_Spielstand</c> with replacement entry (needs the owned-items history).
    /// </summary>
    [Flags]
    public enum LootEntryFlags
    {
        /// <summary>No flag.</summary>
        None = 0,

        /// <summary>Always given in addition to the rolls (boss unique, quest item).</summary>
        Guaranteed = 1,

        /// <summary>Rarity rolls of this entry ignore the luck stat (only loot quality, difficulty, world tier count).</summary>
        IgnoresLuck = 2,

        /// <summary>Equipment of this entry does not count for the bad luck protection (fixed rewards).</summary>
        NoPity = 4
    }
}
