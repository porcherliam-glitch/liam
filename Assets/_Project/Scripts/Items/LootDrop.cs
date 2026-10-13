namespace Aetherfall.Items
{
    /// <summary>One result of a loot roll: an item instance (stack or equipment) or an amount of a currency (gold).</summary>
    public readonly struct LootDrop
    {
        /// <summary>The item, or null for a currency drop.</summary>
        public readonly ItemInstance Item;

        /// <summary>Currency id (<c>currency.gold</c>) of a currency drop, empty for items.</summary>
        public readonly string CurrencyId;

        /// <summary>Amount of a currency drop (items: their count).</summary>
        public readonly int Amount;

        private LootDrop(ItemInstance item, string currencyId, int amount)
        {
            Item = item;
            CurrencyId = currencyId ?? string.Empty;
            Amount = amount;
        }

        /// <summary>True for currency drops.</summary>
        public bool IsCurrency => Item == null;

        /// <summary>Creates an item drop.</summary>
        /// <param name="item">Item instance.</param>
        public static LootDrop ForItem(ItemInstance item)
        {
            return new LootDrop(item, string.Empty, item != null ? item.Count : 0);
        }

        /// <summary>Creates a currency drop.</summary>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="amount">Amount.</param>
        public static LootDrop ForCurrency(string currencyId, int amount)
        {
            return new LootDrop(null, currencyId, amount);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return IsCurrency ? CurrencyId + " " + Amount : Item.ToString();
        }
    }
}
