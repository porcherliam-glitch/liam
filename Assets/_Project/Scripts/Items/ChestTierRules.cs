namespace Aetherfall.Items
{
    /// <summary>
    /// Loot quality, item level delta and name of the chest tiers (GDD 04 5.6 and 4.1 "Truhenstufe 0–3: 0 · Prunktruhe +1 ·
    /// Geheimnis-Truhe +2"). The loot table of a chest names gold, item counts and extras; these rules give the source values.
    /// </summary>
    public static class ChestTierRules
    {
        /// <summary>Loot quality: crate 0, wooden 1, iron 2, hidden 3, ornate 4, secret 5, rift 5 (4–6 by rift tier).</summary>
        /// <param name="tier">Chest tier.</param>
        public static int LootQuality(ChestTier tier)
        {
            switch (tier)
            {
                case ChestTier.Wooden: return 1;
                case ChestTier.Iron: return 2;
                case ChestTier.Hidden: return 3;
                case ChestTier.Ornate: return 4;
                case ChestTier.Secret: return 5;
                case ChestTier.Rift: return 5;
                default: return 0;
            }
        }

        /// <summary>Item level delta: ornate +1, secret +2, else 0.</summary>
        /// <param name="tier">Chest tier.</param>
        public static int ItemLevelDelta(ChestTier tier)
        {
            switch (tier)
            {
                case ChestTier.Ornate: return 1;
                case ChestTier.Secret: return 2;
                default: return 0;
            }
        }

        /// <summary>German name (GDD 04 5.6).</summary>
        /// <param name="tier">Chest tier.</param>
        public static string GermanName(ChestTier tier)
        {
            switch (tier)
            {
                case ChestTier.Wooden: return "Holztruhe";
                case ChestTier.Iron: return "Eisentruhe";
                case ChestTier.Hidden: return "Versteckte Truhe";
                case ChestTier.Ornate: return "Prunktruhe";
                case ChestTier.Secret: return "Geheimnis-Truhe";
                case ChestTier.Rift: return "Riss-Truhe";
                default: return "Kiste";
            }
        }
    }
}
