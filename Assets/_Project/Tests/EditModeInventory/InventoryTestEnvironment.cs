using System;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Inventory and loot services as the <see cref="InventoryInstaller"/> builds them, on a fresh event bus with the test
    /// catalog of <see cref="InventoryTestItems"/>; captures the log. Dispose in <c>[TearDown]</c>.
    /// </summary>
    public sealed class InventoryTestEnvironment : IDisposable
    {
        private readonly Pcg32Random _ids;

        /// <summary>Creates the services.</summary>
        /// <param name="withKit">True = the warrior's starting kit, false = empty inventory.</param>
        /// <param name="seed">Seed of item ids and of the save seed of the loot.</param>
        public InventoryTestEnvironment(bool withKit = true, ulong seed = 1UL)
        {
            _ids = new Pcg32Random(seed + 7UL, 3UL);
            LogCapture = new LogCapture();
            Bus = new EventBus();
            Catalog = InventoryTestItems.CreateCatalog();
            Inventory = new InventoryService(Bus, Catalog, seed, withKit ? new StartingKit(InventoryTestItems.WarriorKit(), 0) : StartingKit.Empty);
            Loot = new LootService(Bus, Inventory, new LootRoller(Catalog, Inventory.Generator), new Pcg32Random(seed + 100UL), AutoPickupMode.GoldAndMaterials);
        }

        /// <summary>Captured log.</summary>
        public LogCapture LogCapture { get; }

        /// <summary>Event bus.</summary>
        public EventBus Bus { get; }

        /// <summary>Item catalog.</summary>
        public ItemCatalog Catalog { get; }

        /// <summary>Inventory service.</summary>
        public InventoryService Inventory { get; }

        /// <summary>Loot service.</summary>
        public LootService Loot { get; }

        /// <summary>Creates the stats of the warrior of GDD 03 8.3 (level 10, strength 20: carry capacity 80 kg) and binds them.</summary>
        public StatCollection AttachWarriorStats()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Strength, 20f);
            stats.SetBase(StatId.Dexterity, 10f);
            stats.SetBase(StatId.Intelligence, 8f);
            stats.SetBase(StatId.Wisdom, 10f);
            stats.SetBase(StatId.Constitution, 18f);
            stats.SetBase(StatId.Charisma, 10f);
            stats.SetBase(StatId.Level, 10f);
            Inventory.AttachPlayerStats(stats);
            return stats;
        }

        /// <summary>Finds the first bag entry of an item, or null.</summary>
        /// <param name="itemId">Item id.</param>
        public ItemInstance FindInBag(string itemId)
        {
            var entries = Inventory.PlayerContainer.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                if (entries[i].ItemId == itemId)
                {
                    return entries[i];
                }
            }

            return null;
        }

        /// <summary>Adds a new item instance to the player's bag and returns it.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="rarity">Rarity.</param>
        public ItemInstance AddToBag(string itemId, int itemLevel = 10, ItemRarity rarity = ItemRarity.Common)
        {
            Catalog.TryGetItem(itemId, out ItemSpec spec);
            ItemInstance item = Inventory.Generator.CreateFixed(spec, itemLevel, rarity, 1, _ids);
            if (!Inventory.TryAdd(InventoryOwners.Player, item, "test"))
            {
                throw new InvalidOperationException("Could not add " + itemId);
            }

            return item;
        }

        /// <summary>Releases the services and restores the log.</summary>
        public void Dispose()
        {
            Loot.Dispose();
            Bus.Dispose();
            LogCapture.Dispose();
        }
    }
}
