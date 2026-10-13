namespace Aetherfall.Items
{
    /// <summary>
    /// The rarity table of GDD 04 3.1 (colours and form codes from GDD 05 1.10, beams from GDD 05 1.10 and GDD 04 5.8,
    /// luck factors k from GDD 04 5.3) as pure functions. All numbers are "Vorschlag" values of the GDD; they move into a
    /// <c>LootBalancing</c> asset with the balancing step (architecture 5.3).
    /// </summary>
    public static class RarityRules
    {
        /// <summary>Number of rarities (Common to Set).</summary>
        public const int Count = 7;

        /// <summary>Colour (GDD 04 3.1 / GDD 05 1.10): grey #A6A6A6, green #4CC35A, blue #3D8BFF, purple #A855F7, orange #FF8C1A, red #E53935, yellow #F2D23C.</summary>
        /// <param name="rarity">Rarity.</param>
        public static RarityColor Color(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return new RarityColor(0x4C, 0xC3, 0x5A);
                case ItemRarity.Rare: return new RarityColor(0x3D, 0x8B, 0xFF);
                case ItemRarity.Epic: return new RarityColor(0xA8, 0x55, 0xF7);
                case ItemRarity.Legendary: return new RarityColor(0xFF, 0x8C, 0x1A);
                case ItemRarity.Mythic: return new RarityColor(0xE5, 0x39, 0x35);
                case ItemRarity.Set: return new RarityColor(0xF2, 0xD2, 0x3C);
                default: return new RarityColor(0xA6, 0xA6, 0xA6);
            }
        }

        /// <summary>Number of random affixes (GDD 04 3.1): 0, 1, 2, 3, 3 (+ legendary effect), 4 (mythic), 2 (set, fixed).</summary>
        /// <param name="rarity">Rarity.</param>
        public static int AffixCount(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return 1;
                case ItemRarity.Rare: return 2;
                case ItemRarity.Epic: return 3;
                case ItemRarity.Legendary: return 3;
                case ItemRarity.Mythic: return 4;
                case ItemRarity.Set: return 2;
                default: return 0;
            }
        }

        /// <summary>Factor on the base value (GDD 04 3.1): 1.00, 1.10, 1.20, 1.30, 1.40, 1.55, set 1.30.</summary>
        /// <param name="rarity">Rarity.</param>
        public static float BaseValueFactor(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return 1.10f;
                case ItemRarity.Rare: return 1.20f;
                case ItemRarity.Epic: return 1.30f;
                case ItemRarity.Legendary: return 1.40f;
                case ItemRarity.Mythic: return 1.55f;
                case ItemRarity.Set: return 1.30f;
                default: return 1.00f;
            }
        }

        /// <summary>Factor on the trade value (GDD 04 3.1): ×1, ×1.5, ×3, ×6, ×15, ×30, set ×8.</summary>
        /// <param name="rarity">Rarity.</param>
        public static float TradeValueFactor(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return 1.5f;
                case ItemRarity.Rare: return 3f;
                case ItemRarity.Epic: return 6f;
                case ItemRarity.Legendary: return 15f;
                case ItemRarity.Mythic: return 30f;
                case ItemRarity.Set: return 8f;
                default: return 1f;
            }
        }

        /// <summary>
        /// Base drop weight of an equipment roll (GDD 04 3.1): 6000, 2800, 900, 300, 45; mythic and set have no own weight
        /// (mythic is an upgrade of a legendary, sets come from set tables).
        /// </summary>
        /// <param name="rarity">Rarity.</param>
        public static int BaseDropWeight(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Common: return 6000;
                case ItemRarity.Uncommon: return 2800;
                case ItemRarity.Rare: return 900;
                case ItemRarity.Epic: return 300;
                case ItemRarity.Legendary: return 45;
                default: return 0;
            }
        }

        /// <summary>Luck factor k of the luck formula (GDD 04 5.3): 0, 0.3, 0.75, 1.5, 2.0; 0 for mythic and set.</summary>
        /// <param name="rarity">Rarity.</param>
        public static float LuckFactor(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return 0.3f;
                case ItemRarity.Rare: return 0.75f;
                case ItemRarity.Epic: return 1.5f;
                case ItemRarity.Legendary: return 2.0f;
                default: return 0f;
            }
        }

        /// <summary>
        /// Lowest item level at which a random equipment roll may produce the rarity (GDD 04 3.1 "ab Item-Level": rare from
        /// iLvl 3, epic and random legendary from iLvl 10, mythic from iLvl 60, sets from iLvl 15). Region gating ("Episch ab
        /// Goldkueste") is not modelled yet.
        /// </summary>
        /// <param name="rarity">Rarity.</param>
        public static int MinItemLevel(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Rare: return 3;
                case ItemRarity.Epic: return 10;
                case ItemRarity.Legendary: return 10;
                case ItemRarity.Mythic: return 60;
                case ItemRarity.Set: return 15;
                default: return 1;
            }
        }

        /// <summary>
        /// Height of the loot beam in metres (GDD 05 1.10): common 0 (only glitter), uncommon 0.5 (glow), rare 1.5, epic 3,
        /// legendary 6, mythic 8, set 4 (double beam).
        /// </summary>
        /// <param name="rarity">Rarity.</param>
        public static float BeamHeight(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return 0.5f;
                case ItemRarity.Rare: return 1.5f;
                case ItemRarity.Epic: return 3f;
                case ItemRarity.Legendary: return 6f;
                case ItemRarity.Mythic: return 8f;
                case ItemRarity.Set: return 4f;
                default: return 0f;
            }
        }

        /// <summary>
        /// True if items of this rarity are locked automatically when picked up (GDD 04 1.6: legendary, mythic, set).
        /// </summary>
        /// <param name="rarity">Rarity.</param>
        public static bool LocksAutomatically(ItemRarity rarity)
        {
            return rarity == ItemRarity.Legendary || rarity == ItemRarity.Mythic || rarity == ItemRarity.Set;
        }

        /// <summary>German display name (GDD 04 3.1). TODO (localization step): string table key <c>rarity.*</c>.</summary>
        /// <param name="rarity">Rarity.</param>
        public static string GermanName(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return "Ungewöhnlich";
                case ItemRarity.Rare: return "Selten";
                case ItemRarity.Epic: return "Episch";
                case ItemRarity.Legendary: return "Legendär";
                case ItemRarity.Mythic: return "Mythisch";
                case ItemRarity.Set: return "Set";
                default: return "Gewöhnlich";
            }
        }

        /// <summary>Form code (GDD 05 1.10, always visible next to the colour): one to six diamonds, set = chain link.</summary>
        /// <param name="rarity">Rarity.</param>
        public static string ShapeCode(ItemRarity rarity)
        {
            switch (rarity)
            {
                case ItemRarity.Uncommon: return "◆◆";
                case ItemRarity.Rare: return "◆◆◆";
                case ItemRarity.Epic: return "◆◆◆◆";
                case ItemRarity.Legendary: return "◆◆◆◆◆";
                case ItemRarity.Mythic: return "◆◆◆◆◆◆";
                case ItemRarity.Set: return "∞";
                default: return "◆";
            }
        }

        /// <summary>Order value for "better than": Common 0 … Mythic 5; set counts like epic (factor 1.30).</summary>
        /// <param name="rarity">Rarity.</param>
        public static int Rank(ItemRarity rarity)
        {
            return rarity == ItemRarity.Set ? (int)ItemRarity.Epic : (int)rarity;
        }
    }
}
