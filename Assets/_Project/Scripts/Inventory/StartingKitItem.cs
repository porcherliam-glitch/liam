using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>One item of the starting equipment (pure data): item id, count, item level, rarity and the slot it starts in.</summary>
    public readonly struct StartingKitItem
    {
        /// <summary>Item id.</summary>
        public readonly string ItemId;

        /// <summary>Count (at least 1).</summary>
        public readonly int Count;

        /// <summary>Item level (definitions with a fixed level keep theirs).</summary>
        public readonly int ItemLevel;

        /// <summary>Rarity.</summary>
        public readonly ItemRarity Rarity;

        /// <summary>Slot to equip it in; <see cref="EquipmentSlot.None"/> = bag; a quick slot = bag plus quick slot reference.</summary>
        public readonly EquipmentSlot Slot;

        /// <summary>Creates the entry.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="count">Count.</param>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="rarity">Rarity.</param>
        /// <param name="slot">Start slot.</param>
        public StartingKitItem(string itemId, int count, int itemLevel, ItemRarity rarity, EquipmentSlot slot)
        {
            ItemId = itemId ?? string.Empty;
            Count = count < 1 ? 1 : count;
            ItemLevel = itemLevel < 1 ? 1 : itemLevel;
            Rarity = rarity;
            Slot = slot;
        }
    }
}
