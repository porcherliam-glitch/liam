using System;
using Aetherfall.Inventory;

namespace Aetherfall.Quests
{
    /// <summary><see cref="IQuestInventory"/> on top of the inventory service (player owner, bag plus equipment).</summary>
    public sealed class InventoryQuestBridge : IQuestInventory
    {
        private readonly IInventoryService _inventory;

        /// <summary>Creates the bridge.</summary>
        /// <param name="inventory">Inventory service.</param>
        public InventoryQuestBridge(IInventoryService inventory)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
        }

        /// <inheritdoc />
        public int CountOf(string itemId)
        {
            return string.IsNullOrEmpty(itemId) ? 0 : _inventory.CountOf(InventoryOwners.Player, itemId);
        }
    }
}
