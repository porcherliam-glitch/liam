using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Filter of the inventory list (GDD 04 1.4): category (or all), only new, hide locked. A pure value; the UI keeps one per
    /// category.
    /// </summary>
    public readonly struct InventoryFilter
    {
        /// <summary>Category to show; <see cref="ItemCategory.None"/> = all ("Alle").</summary>
        public readonly ItemCategory Category;

        /// <summary>Only items marked new.</summary>
        public readonly bool OnlyNew;

        /// <summary>Hide locked items.</summary>
        public readonly bool HideLocked;

        /// <summary>Creates a filter.</summary>
        /// <param name="category">Category or None for all.</param>
        /// <param name="onlyNew">Only new items.</param>
        /// <param name="hideLocked">Hide locked items.</param>
        public InventoryFilter(ItemCategory category, bool onlyNew = false, bool hideLocked = false)
        {
            Category = category;
            OnlyNew = onlyNew;
            HideLocked = hideLocked;
        }

        /// <summary>Filter that shows everything.</summary>
        public static InventoryFilter All => new InventoryFilter(ItemCategory.None);

        /// <summary>True if the entry passes the filter.</summary>
        /// <param name="instance">Entry.</param>
        /// <param name="spec">Its item data (null = unknown item, only shown without category filter).</param>
        public bool Matches(ItemInstance instance, ItemSpec spec)
        {
            if (instance == null)
            {
                return false;
            }

            if (Category != ItemCategory.None && (spec == null || spec.Category != Category))
            {
                return false;
            }

            if (OnlyNew && !instance.IsNew)
            {
                return false;
            }

            return !(HideLocked && instance.IsLocked);
        }
    }
}
