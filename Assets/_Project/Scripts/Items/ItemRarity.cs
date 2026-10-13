namespace Aetherfall.Items
{
    /// <summary>
    /// Rarity tiers of §12.3 (GDD 04 3.1). The order of Common to Mythic is the quality order; <see cref="Set"/> is a separate
    /// kind (only from set tables). Values are stored in assets: never renumber. Saves and events use the ids of
    /// <see cref="ItemRarityIds"/>.
    /// </summary>
    public enum ItemRarity
    {
        /// <summary>German "Gewoehnlich" (grey).</summary>
        Common = 0,

        /// <summary>German "Ungewoehnlich" (green).</summary>
        Uncommon = 1,

        /// <summary>German "Selten" (blue).</summary>
        Rare = 2,

        /// <summary>German "Episch" (purple).</summary>
        Epic = 3,

        /// <summary>German "Legendaer" (orange), with a legendary effect.</summary>
        Legendary = 4,

        /// <summary>German "Mythisch" (red), endgame only (upgrade of a legendary drop).</summary>
        Mythic = 5,

        /// <summary>Set item (yellow), bonus for several worn pieces.</summary>
        Set = 6
    }
}
