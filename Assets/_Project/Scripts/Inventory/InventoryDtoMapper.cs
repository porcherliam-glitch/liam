using System.Collections.Generic;
using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Converts item instances to save DTOs and back. Loading validates: unknown item ids (content removed), empty ids and
    /// unknown rarities are reported and the entry is skipped or repaired (architecture 6.3 "Unbekannte IDs im Save werden
    /// beim Laden verworfen und geloggt").
    /// </summary>
    public static class InventoryDtoMapper
    {
        /// <summary>Save form of an instance.</summary>
        /// <param name="instance">Instance.</param>
        public static ItemInstanceDto ToDto(ItemInstance instance)
        {
            var dto = new ItemInstanceDto
            {
                InstanceId = instance.InstanceId,
                ItemId = instance.ItemId,
                ItemLevel = instance.ItemLevel,
                Rarity = ItemRarityIds.ToId(instance.Rarity),
                BaseRoll = instance.BaseRoll,
                Count = instance.Count,
                Flags = ItemFlagIds.ToIds(instance.Flags)
            };
            IReadOnlyList<AffixRoll> affixes = instance.Affixes;
            for (int i = 0; i < affixes.Count; i++)
            {
                dto.Affixes.Add(new AffixRollDto { Id = affixes[i].AffixId, Tier = affixes[i].Tier, Value = affixes[i].Value });
            }

            return dto;
        }

        /// <summary>Creates an instance from its save form.</summary>
        /// <param name="dto">DTO.</param>
        /// <param name="catalog">Item data (unknown items are rejected).</param>
        /// <param name="instance">The instance, or null.</param>
        /// <param name="problem">Reason for rejection or repair, empty if none.</param>
        /// <returns>True if an instance was created.</returns>
        public static bool TryFromDto(ItemInstanceDto dto, IItemCatalog catalog, out ItemInstance instance, out string problem)
        {
            instance = null;
            problem = string.Empty;
            if (dto == null || string.IsNullOrEmpty(dto.ItemId) || string.IsNullOrEmpty(dto.InstanceId))
            {
                problem = "Item entry without item or instance id.";
                return false;
            }

            if (catalog == null || !catalog.TryGetItem(dto.ItemId, out ItemSpec spec))
            {
                problem = "Unknown item '" + dto.ItemId + "' (removed from the content?).";
                return false;
            }

            if (!ItemRarityIds.TryParse(dto.Rarity, out ItemRarity rarity))
            {
                problem = "Item '" + dto.ItemId + "': unknown rarity '" + dto.Rarity + "', loaded as common.";
            }

            var affixes = new List<AffixRoll>();
            if (dto.Affixes != null)
            {
                for (int i = 0; i < dto.Affixes.Count; i++)
                {
                    AffixRollDto roll = dto.Affixes[i];
                    if (roll != null && !string.IsNullOrEmpty(roll.Id))
                    {
                        affixes.Add(new AffixRoll(roll.Id, roll.Tier, roll.Value));
                    }
                }
            }

            int count = spec.IsStackable ? System.Math.Max(1, System.Math.Min(spec.StackSize, dto.Count)) : 1;
            instance = new ItemInstance(dto.InstanceId, dto.ItemId, dto.ItemLevel, rarity, dto.BaseRoll, count, ItemFlagIds.FromIds(dto.Flags), affixes);
            return true;
        }
    }
}
