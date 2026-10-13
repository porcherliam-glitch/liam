using System.Collections.Generic;

namespace Aetherfall.Items
{
    /// <summary>
    /// Read access to the item data of the pure logic (generator, loot roller, inventory): items, affixes, loot tables and
    /// the random equipment pool, all as plain specs (no ScriptableObjects, so the logic runs in tests).
    /// </summary>
    public interface IItemCatalog
    {
        /// <summary>All items in registration order.</summary>
        IReadOnlyList<ItemSpec> Items { get; }

        /// <summary>The affix pool.</summary>
        AffixPool Affixes { get; }

        /// <summary>Finds an item.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="spec">Item data or null.</param>
        bool TryGetItem(string itemId, out ItemSpec spec);

        /// <summary>Finds a loot table.</summary>
        /// <param name="tableId">Table id.</param>
        /// <param name="table">Table or null.</param>
        bool TryGetLootTable(string tableId, out LootTableSpec table);

        /// <summary>Items of the random equipment pool of a group (<see cref="ItemSpec.RandomDrop"/>).</summary>
        /// <param name="group">Group.</param>
        IReadOnlyList<ItemSpec> RandomDropPool(EquipmentGroup group);
    }
}
