namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Colour tokens of GDD 05 (1.1, 1.9, 1.10, 1.11, 3.2, 3.4) as hex text. The same values are the USS variables in
    /// <c>Assets/_Project/Art/UI/Styles/Tokens.uss</c> (a test compares both); colour-blind and contrast modes later swap
    /// these tokens, never single screens (GDD 05 1.1, 4.3).
    /// </summary>
    public static class UiColorTokens
    {
        /// <summary>rarity.common – grey.</summary>
        public const string RarityCommon = "#A6A6A6";

        /// <summary>rarity.uncommon – green.</summary>
        public const string RarityUncommon = "#4CC35A";

        /// <summary>rarity.rare – blue.</summary>
        public const string RarityRare = "#3D8BFF";

        /// <summary>rarity.epic – purple.</summary>
        public const string RarityEpic = "#A855F7";

        /// <summary>rarity.legendary – orange.</summary>
        public const string RarityLegendary = "#FF8C1A";

        /// <summary>rarity.mythic – red.</summary>
        public const string RarityMythic = "#E53935";

        /// <summary>rarity.set – yellow.</summary>
        public const string RaritySet = "#F2D23C";

        /// <summary>ui.focus – white gold focus frame (GDD 05 1.4).</summary>
        public const string UiFocus = "#FFE8A3";

        /// <summary>ui.better – comparison better (green ▲).</summary>
        public const string UiBetter = "#5FD068";

        /// <summary>ui.worse – comparison worse (red ▼).</summary>
        public const string UiWorse = "#FF6B5E";

        /// <summary>Panel colour #101418 (used with 80 % opacity, GDD 05 1.6).</summary>
        public const string UiPanel = "#101418";

        /// <summary>aether – Aether turquoise (reserved for Aether, GDD 05 3.4).</summary>
        public const string Aether = "#2FE6D6";

        /// <summary>aether.core – almost white core.</summary>
        public const string AetherCore = "#E6FFFC";

        /// <summary>aether.edge – petrol edge.</summary>
        public const string AetherEdge = "#0B6E73";

        /// <summary>void – light-swallowing black violet.</summary>
        public const string Void = "#140A1F";

        /// <summary>void.edge – pale lavender.</summary>
        public const string VoidEdge = "#C8B8FF";

        /// <summary>telegraph.parry – white gold glint.</summary>
        public const string TelegraphParry = "#FFE8A3";

        /// <summary>telegraph.unblockable – red flash.</summary>
        public const string TelegraphUnblockable = "#FF3B30";

        /// <summary>damage.physical.</summary>
        public const string DamagePhysical = "#FFFFFF";

        /// <summary>damage.fire.</summary>
        public const string DamageFire = "#FF5A1F";

        /// <summary>damage.ice.</summary>
        public const string DamageIce = "#9FD8FF";

        /// <summary>damage.lightning.</summary>
        public const string DamageLightning = "#FFE14D";

        /// <summary>damage.poison.</summary>
        public const string DamagePoison = "#8BD13A";

        /// <summary>damage.shadow.</summary>
        public const string DamageShadow = "#7B61D9";

        /// <summary>damage.aether.</summary>
        public const string DamageAether = "#2FE6D6";

        /// <summary>quest.main – gold.</summary>
        public const string QuestMain = "#F2C14E";

        /// <summary>USS variable name of each rarity (index = <c>Aetherfall.Items.ItemRarity</c> value: Common … Set).</summary>
        /// <param name="rarityIndex">Rarity value 0–6.</param>
        public static string RarityAccent(int rarityIndex)
        {
            switch (rarityIndex)
            {
                case 0: return "rarity-common";
                case 1: return "rarity-uncommon";
                case 2: return "rarity-rare";
                case 3: return "rarity-epic";
                case 4: return "rarity-legendary";
                case 5: return "rarity-mythic";
                case 6: return "rarity-set";
                default: return string.Empty;
            }
        }
    }
}
