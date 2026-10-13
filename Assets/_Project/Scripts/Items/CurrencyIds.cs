namespace Aetherfall.Items
{
    /// <summary>Ids of the currencies (architecture 6.1 prefix <c>currency.</c>, GDD 04 8.1).</summary>
    public static class CurrencyIds
    {
        /// <summary>Gold.</summary>
        public const string Gold = "currency.gold";

        /// <summary>Aether shards (endgame currency).</summary>
        public const string AetherShards = "currency.aether_splitter";

        /// <summary>German display name of a currency id (unknown ids are returned unchanged).</summary>
        /// <param name="currencyId">Currency id.</param>
        public static string GermanName(string currencyId)
        {
            switch (currencyId)
            {
                case Gold: return "Gold";
                case AetherShards: return "Aether-Splitter";
                default: return currencyId ?? string.Empty;
            }
        }
    }
}
