namespace Aetherfall.Inventory
{
    /// <summary>Sortings of the inventory list (GDD 04 1.4). Favourites always come first.</summary>
    public enum InventorySortMode
    {
        /// <summary>Standard: rarity, then item level (both descending).</summary>
        Rarity = 0,

        /// <summary>New items first, then rarity.</summary>
        Newest = 1,

        /// <summary>Item level descending.</summary>
        ItemLevel = 2,

        /// <summary>Value descending.</summary>
        Value = 3,

        /// <summary>Weight descending.</summary>
        Weight = 4,

        /// <summary>Value per kg ascending (best candidates to drop first, GDD 04 1.3).</summary>
        ValuePerKilogram = 5,

        /// <summary>Name ascending.</summary>
        Name = 6,

        /// <summary>Category, then name.</summary>
        Category = 7
    }
}
