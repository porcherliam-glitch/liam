using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Items;
using Aetherfall.SaveSystem;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Saves and restores the section <c>inventory</c> (architecture 9.2, load order 50): bag, equipment, quick slots,
    /// currencies (<see cref="InventoryService"/>) and bad luck counters, loot seed and counter, opened chests
    /// (<see cref="LootService"/>). A new game (data null) gets the starting kit and a new loot seed.
    /// </summary>
    /// <remarks>
    /// <see cref="Restore"/> only sets state and sends no global events; the stat modifiers of the equipment are rebuilt
    /// right away (they are not saved, architecture 11.5). Unknown items are dropped with a warning (content removed).
    /// </remarks>
    public sealed class InventorySaveable : Saveable<InventoryDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "inventory";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 50;

        private readonly InventoryService _inventory;
        private readonly LootService _loot;

        /// <summary>Creates the saveable.</summary>
        /// <param name="inventory">Inventory service.</param>
        /// <param name="loot">Loot service.</param>
        public InventorySaveable(InventoryService inventory, LootService loot) : base(Key, Order)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _loot = loot ?? throw new ArgumentNullException(nameof(loot));
        }

        /// <inheritdoc />
        protected override InventoryDto Capture()
        {
            var dto = new InventoryDto();
            IReadOnlyList<ItemInstance> bag = _inventory.PlayerContainer.Entries;
            for (int i = 0; i < bag.Count; i++)
            {
                dto.Items.Add(InventoryDtoMapper.ToDto(bag[i]));
            }

            Equipment equipment = _inventory.PlayerEquipment;
            for (int i = 0; i < EquipmentSlotIds.All.Length; i++)
            {
                EquipmentSlot slot = EquipmentSlotIds.All[i];
                if (EquipmentSlotIds.IsQuickSlot(slot))
                {
                    string itemId = equipment.GetQuickSlot(slot);
                    if (itemId.Length > 0)
                    {
                        dto.QuickSlots[EquipmentSlotIds.ToId(slot)] = itemId;
                    }

                    continue;
                }

                ItemInstance item = equipment.Get(slot);
                if (item != null)
                {
                    dto.Equipment[EquipmentSlotIds.ToId(slot)] = InventoryDtoMapper.ToDto(item);
                }
            }

            foreach (KeyValuePair<string, int> pair in _inventory.PlayerWallet.Amounts)
            {
                dto.Currencies[pair.Key] = pair.Value;
            }

            dto.PityLegendary = _loot.Pity.LegendaryCounter;
            dto.PityMythic = _loot.Pity.MythicCounter;
            dto.LootSeed = _loot.SaveSeed;
            dto.LootCounter = _loot.RollCounter;
            dto.OpenedChests = _loot.Chests.ToSortedList();
            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(InventoryDto data, in LoadContext ctx)
        {
            if (data == null)
            {
                _inventory.ResetToStartingKit();
                _loot.ResetForNewGame();
                return;
            }

            IItemCatalog catalog = _inventory.Catalog;
            var bag = new List<ItemInstance>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            if (data.Items != null)
            {
                for (int i = 0; i < data.Items.Count; i++)
                {
                    if (Convert(data.Items[i], catalog, seen, out ItemInstance item))
                    {
                        bag.Add(item);
                    }
                }
            }

            var equipped = new List<KeyValuePair<EquipmentSlot, ItemInstance>>();
            if (data.Equipment != null)
            {
                foreach (KeyValuePair<string, ItemInstanceDto> pair in data.Equipment)
                {
                    if (!EquipmentSlotIds.TryParse(pair.Key, out EquipmentSlot slot) || EquipmentSlotIds.IsQuickSlot(slot))
                    {
                        Log.Warning(LogCategory.Save, "Inventory: unknown equipment slot '" + pair.Key + "' in the save is ignored.");
                        continue;
                    }

                    if (!Convert(pair.Value, catalog, seen, out ItemInstance item))
                    {
                        continue;
                    }

                    if (catalog.TryGetItem(item.ItemId, out ItemSpec spec) && Equipment.Fits(spec.EquipKind, slot))
                    {
                        equipped.Add(new KeyValuePair<EquipmentSlot, ItemInstance>(slot, item));
                    }
                    else
                    {
                        Log.Warning(LogCategory.Save, "Inventory: '" + item.ItemId + "' no longer fits the slot '" + pair.Key + "' and goes into the bag.");
                        bag.Add(item);
                    }
                }
            }

            var quick = new List<KeyValuePair<EquipmentSlot, string>>();
            if (data.QuickSlots != null)
            {
                foreach (KeyValuePair<string, string> pair in data.QuickSlots)
                {
                    if (EquipmentSlotIds.TryParse(pair.Key, out EquipmentSlot slot) && EquipmentSlotIds.IsQuickSlot(slot) && catalog.TryGetItem(pair.Value, out _))
                    {
                        quick.Add(new KeyValuePair<EquipmentSlot, string>(slot, pair.Value));
                    }
                }
            }

            _inventory.LoadState(bag, equipped, quick, data.Currencies);
            _loot.LoadState(data.LootSeed, data.LootCounter, data.PityLegendary, data.PityMythic, data.OpenedChests);
        }

        private static bool Convert(ItemInstanceDto dto, IItemCatalog catalog, HashSet<string> seen, out ItemInstance item)
        {
            if (!InventoryDtoMapper.TryFromDto(dto, catalog, out item, out string problem))
            {
                Log.Warning(LogCategory.Save, "Inventory: " + problem + " The entry is dropped.");
                return false;
            }

            if (problem.Length > 0)
            {
                Log.Warning(LogCategory.Save, "Inventory: " + problem);
            }

            if (!seen.Add(item.InstanceId))
            {
                Log.Warning(LogCategory.Save, "Inventory: duplicate instance id '" + item.InstanceId + "' is dropped.");
                item = null;
                return false;
            }

            return true;
        }
    }
}
