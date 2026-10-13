using System;
using System.Collections.Generic;
using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Sorting and filtering of inventory entries as pure functions (architecture 11.6 "Sortieren/Filtern als reine
    /// Funktionen", GDD 04 1.4): favourites first, then the chosen order, ties broken by name and instance id so the order is
    /// stable across frames.
    /// </summary>
    public static class InventorySorting
    {
        /// <summary>Fills <paramref name="result"/> with the entries that pass the filter, sorted.</summary>
        /// <param name="entries">Entries of a container.</param>
        /// <param name="catalog">Item data.</param>
        /// <param name="filter">Filter.</param>
        /// <param name="mode">Sort order.</param>
        /// <param name="result">Receives the entries (cleared first).</param>
        public static void Query(IReadOnlyList<ItemInstance> entries, IItemCatalog catalog, in InventoryFilter filter, InventorySortMode mode,
            List<ItemInstance> result)
        {
            if (result == null)
            {
                throw new ArgumentNullException(nameof(result));
            }

            result.Clear();
            if (entries == null || catalog == null)
            {
                return;
            }

            for (int i = 0; i < entries.Count; i++)
            {
                catalog.TryGetItem(entries[i].ItemId, out ItemSpec spec);
                if (filter.Matches(entries[i], spec))
                {
                    result.Add(entries[i]);
                }
            }

            Sort(result, catalog, mode);
        }

        /// <summary>Sorts entries in place.</summary>
        /// <param name="items">Entries.</param>
        /// <param name="catalog">Item data.</param>
        /// <param name="mode">Sort order.</param>
        public static void Sort(List<ItemInstance> items, IItemCatalog catalog, InventorySortMode mode)
        {
            if (items == null || catalog == null || items.Count < 2)
            {
                return;
            }

            items.Sort((a, b) => Compare(a, b, catalog, mode));
        }

        /// <summary>Compares two entries in the given order (favourites first).</summary>
        /// <param name="a">First entry.</param>
        /// <param name="b">Second entry.</param>
        /// <param name="catalog">Item data.</param>
        /// <param name="mode">Sort order.</param>
        /// <returns>Negative if <paramref name="a"/> comes first.</returns>
        public static int Compare(ItemInstance a, ItemInstance b, IItemCatalog catalog, InventorySortMode mode)
        {
            int result = b.IsFavorite.CompareTo(a.IsFavorite);
            if (result != 0)
            {
                return result;
            }

            catalog.TryGetItem(a.ItemId, out ItemSpec specA);
            catalog.TryGetItem(b.ItemId, out ItemSpec specB);
            switch (mode)
            {
                case InventorySortMode.Newest:
                    result = b.IsNew.CompareTo(a.IsNew);
                    if (result == 0)
                    {
                        result = CompareRarity(a, b);
                    }

                    break;
                case InventorySortMode.ItemLevel:
                    result = b.ItemLevel.CompareTo(a.ItemLevel);
                    break;
                case InventorySortMode.Value:
                    result = Value(specB, b).CompareTo(Value(specA, a));
                    break;
                case InventorySortMode.Weight:
                    result = Weight(specB, b).CompareTo(Weight(specA, a));
                    break;
                case InventorySortMode.ValuePerKilogram:
                    result = ValuePerKilogram(specA, a).CompareTo(ValuePerKilogram(specB, b));
                    break;
                case InventorySortMode.Name:
                    break;
                case InventorySortMode.Category:
                    result = Category(specA).CompareTo(Category(specB));
                    break;
                default:
                    result = CompareRarity(a, b);
                    break;
            }

            if (result != 0)
            {
                return result;
            }

            result = string.Compare(Name(specA, a), Name(specB, b), StringComparison.CurrentCulture);
            return result != 0 ? result : string.CompareOrdinal(a.InstanceId, b.InstanceId);
        }

        private static int CompareRarity(ItemInstance a, ItemInstance b)
        {
            int result = RarityRules.Rank(b.Rarity).CompareTo(RarityRules.Rank(a.Rarity));
            return result != 0 ? result : b.ItemLevel.CompareTo(a.ItemLevel);
        }

        private static float Value(ItemSpec spec, ItemInstance item)
        {
            return ItemStats.TradeValue(spec, item) * item.Count;
        }

        private static float Weight(ItemSpec spec, ItemInstance item)
        {
            return spec != null ? spec.Weight * item.Count : 0f;
        }

        private static float ValuePerKilogram(ItemSpec spec, ItemInstance item)
        {
            float weight = Weight(spec, item);
            return weight > 0f ? Value(spec, item) / weight : float.PositiveInfinity;
        }

        private static int Category(ItemSpec spec)
        {
            return spec != null ? (int)spec.Category : int.MaxValue;
        }

        private static string Name(ItemSpec spec, ItemInstance item)
        {
            return spec != null ? spec.DisplayName : item.ItemId;
        }
    }
}
