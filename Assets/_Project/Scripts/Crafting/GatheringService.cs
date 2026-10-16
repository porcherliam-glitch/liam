using System;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Utilities;

namespace Aetherfall.Crafting
{
    /// <summary>
    /// Default <see cref="IGatheringService"/> (S30): rolls the yield (<see cref="GatheringRules"/>) and adds it to the player's
    /// bag. The inventory reports the pickup (<c>ItemPickedUp</c>, the toast "Blutwurz ×2") and the change, so "Sammle" objectives
    /// count it.
    /// </summary>
    public sealed class GatheringService : IGatheringService
    {
        private readonly IInventoryService _inventory;
        private readonly IRandom _random;

        /// <summary>Creates the service.</summary>
        /// <param name="inventory">Inventory service.</param>
        /// <param name="random">Random source of the yield.</param>
        public GatheringService(IInventoryService inventory, IRandom random)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        /// <inheritdoc />
        public int Harvest(string nodeId, string itemId, int minYield, int maxYield)
        {
            if (string.IsNullOrEmpty(itemId))
            {
                return 0;
            }

            // No gathering professions before Stufe B: level 0.
            int amount = GatheringRules.RollYield(minYield, maxYield, 0, _random);
            if (!_inventory.TryAddNew(InventoryOwners.Player, itemId, amount, nodeId ?? string.Empty))
            {
                Log.Warning(LogCategory.Data, "Harvest '" + nodeId + "': item '" + itemId + "' could not be added (unknown item or full inventory).");
                return 0;
            }

            return amount;
        }
    }
}
