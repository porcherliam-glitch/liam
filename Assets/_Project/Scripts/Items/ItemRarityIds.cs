namespace Aetherfall.Items
{
    /// <summary>
    /// Stable string ids of <see cref="ItemRarity"/> for saves and events (GDD 04 4.9: <c>"rarity": "episch"</c>; event
    /// <c>LootDropped.BestRarity</c>). Never change a value.
    /// </summary>
    public static class ItemRarityIds
    {
        /// <summary>Id of <see cref="ItemRarity.Common"/>.</summary>
        public const string Common = "gewoehnlich";

        /// <summary>Id of <see cref="ItemRarity.Uncommon"/>.</summary>
        public const string Uncommon = "ungewoehnlich";

        /// <summary>Id of <see cref="ItemRarity.Rare"/>.</summary>
        public const string Rare = "selten";

        /// <summary>Id of <see cref="ItemRarity.Epic"/>.</summary>
        public const string Epic = "episch";

        /// <summary>Id of <see cref="ItemRarity.Legendary"/>.</summary>
        public const string Legendary = "legendaer";

        /// <summary>Id of <see cref="ItemRarity.Mythic"/>.</summary>
        public const string Mythic = "mythisch";

        /// <summary>Id of <see cref="ItemRarity.Set"/>.</summary>
        public const string Set = "set";

        /// <summary>Id of a rarity.</summary>
        /// <param name="rarity">Rarity.</param>
        public static string ToId(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return Uncommon;
                case ItemRarity.Rare: return Rare;
                case ItemRarity.Epic: return Epic;
                case ItemRarity.Legendary: return Legendary;
                case ItemRarity.Mythic: return Mythic;
                case ItemRarity.Set: return Set;
                default: return Common;
            }
        }

        /// <summary>Parses an id.</summary>
        /// <param name="id">Id.</param>
        /// <param name="rarity">Rarity (Common if unknown).</param>
        /// <returns>True if the id is known.</returns>
        public static bool TryParse(string id, out ItemRarity rarity)
        {
            switch (id)
            {
                case Common: rarity = ItemRarity.Common; return true;
                case Uncommon: rarity = ItemRarity.Uncommon; return true;
                case Rare: rarity = ItemRarity.Rare; return true;
                case Epic: rarity = ItemRarity.Epic; return true;
                case Legendary: rarity = ItemRarity.Legendary; return true;
                case Mythic: rarity = ItemRarity.Mythic; return true;
                case Set: rarity = ItemRarity.Set; return true;
                default: rarity = ItemRarity.Common; return false;
            }
        }
    }
}
