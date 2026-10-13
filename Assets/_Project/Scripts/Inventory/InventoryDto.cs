using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Save section <c>inventory</c> (architecture 9.2, load order 50): the player's bag, equipment, quick slots, currencies,
    /// the bad luck counters, the loot seed and roll counter, and the opened chests (until the world objects store exists).
    /// Stat modifiers are not saved: they are rebuilt from the equipment (architecture 11.5).
    /// </summary>
    [Preserve]
    public sealed class InventoryDto
    {
        /// <summary>Bag entries.</summary>
        public List<ItemInstanceDto> Items = new List<ItemInstanceDto>();

        /// <summary>Equipped items by slot id (<c>haupthand</c>, <c>ring_1</c> …).</summary>
        public Dictionary<string, ItemInstanceDto> Equipment = new Dictionary<string, ItemInstanceDto>();

        /// <summary>Item ids of the quick slots by slot id (<c>schnellslot_1</c> …).</summary>
        public Dictionary<string, string> QuickSlots = new Dictionary<string, string>();

        /// <summary>Currency amounts by currency id (<c>currency.gold</c>).</summary>
        public Dictionary<string, int> Currencies = new Dictionary<string, int>();

        /// <summary>Bad luck counter Z_L (GDD 04 5.5).</summary>
        public int PityLegendary;

        /// <summary>Bad luck counter Z_M.</summary>
        public int PityMythic;

        /// <summary>Seed of all loot rolls of this save (GDD 04 5.4 step 3).</summary>
        public ulong LootSeed;

        /// <summary>Counter of enemy loot rolls.</summary>
        public long LootCounter;

        /// <summary>Ids of opened chests (moves to the section <c>worldobjects</c> with the world step).</summary>
        public List<string> OpenedChests = new List<string>();
    }
}
