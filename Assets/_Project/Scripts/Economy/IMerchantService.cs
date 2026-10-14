using System.Collections.Generic;
using Aetherfall.Items;

namespace Aetherfall.Economy
{
    /// <summary>One item a merchant offers (a line of the stock with pieces left and the price for one piece).</summary>
    public readonly struct MerchantOffer
    {
        /// <summary>Creates the offer.</summary>
        /// <param name="index">Index in the merchant's stock.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="name">Display name.</param>
        /// <param name="category">Item category.</param>
        /// <param name="itemLevel">Item level of the pieces sold.</param>
        /// <param name="count">Pieces left.</param>
        /// <param name="price">Price of one piece.</param>
        public MerchantOffer(int index, string itemId, string name, ItemCategory category, int itemLevel, int count, int price)
        {
            Index = index;
            ItemId = itemId;
            Name = name;
            Category = category;
            ItemLevel = itemLevel;
            Count = count;
            Price = price;
        }

        /// <summary>Index in the merchant's stock.</summary>
        public int Index { get; }

        /// <summary>Item id.</summary>
        public string ItemId { get; }

        /// <summary>Display name.</summary>
        public string Name { get; }

        /// <summary>Item category.</summary>
        public ItemCategory Category { get; }

        /// <summary>Item level of the pieces sold.</summary>
        public int ItemLevel { get; }

        /// <summary>Pieces left until the next restock.</summary>
        public int Count { get; }

        /// <summary>Price of one piece.</summary>
        public int Price { get; }
    }

    /// <summary>An item the player sold, which the merchant keeps until the next restock (GDD 04, "Rückkauf").</summary>
    public sealed class BuybackEntry
    {
        /// <summary>Creates the entry.</summary>
        /// <param name="item">The sold item (all pieces of the sale).</param>
        /// <param name="price">Price the player got (and pays to buy it back).</param>
        public BuybackEntry(ItemInstance item, int price)
        {
            Item = item;
            Price = price;
        }

        /// <summary>The sold item.</summary>
        public ItemInstance Item { get; }

        /// <summary>Price of the whole entry.</summary>
        public int Price { get; }
    }

    /// <summary>
    /// The merchants of the game (GDD 04 8.2): stock with restock every few game days, gold with daily refill, prices after
    /// 8.4, selling with demand drop and buyback of the last 20 sales. The player trades with gold from the inventory.
    /// </summary>
    public interface IMerchantService
    {
        /// <summary>Changes with every trade and restock (UI refresh).</summary>
        int Revision { get; }

        /// <summary>All merchants.</summary>
        IReadOnlyList<MerchantDefinition> Merchants { get; }

        /// <summary>The merchant an NPC runs.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="merchant">The merchant.</param>
        bool TryGetForNpc(string npcId, out MerchantDefinition merchant);

        /// <summary>Gold the merchant has now.</summary>
        /// <param name="merchantId">Merchant id.</param>
        int Gold(string merchantId);

        /// <summary>The merchant's offers with pieces left and prices.</summary>
        /// <param name="merchantId">Merchant id.</param>
        IReadOnlyList<MerchantOffer> Offers(string merchantId);

        /// <summary>Price the merchant pays for one piece of an item, or 0 if he does not buy it.</summary>
        /// <param name="merchantId">Merchant id.</param>
        /// <param name="item">Item in the player's bag.</param>
        int SellPrice(string merchantId, ItemInstance item);

        /// <summary>Items the player sold since the restock (newest first).</summary>
        /// <param name="merchantId">Merchant id.</param>
        IReadOnlyList<BuybackEntry> Buyback(string merchantId);

        /// <summary>Buys pieces of an offer.</summary>
        /// <param name="merchantId">Merchant id.</param>
        /// <param name="offerIndex">Stock index.</param>
        /// <param name="count">Pieces.</param>
        /// <param name="reason">German reason if it fails.</param>
        bool TryBuy(string merchantId, int offerIndex, int count, out string reason);

        /// <summary>Sells pieces of an item from the player's bag.</summary>
        /// <param name="merchantId">Merchant id.</param>
        /// <param name="instanceId">Instance id in the bag.</param>
        /// <param name="count">Pieces.</param>
        /// <param name="reason">German reason if it fails.</param>
        bool TrySell(string merchantId, string instanceId, int count, out string reason);

        /// <summary>Buys a sold item back for the price the player got.</summary>
        /// <param name="merchantId">Merchant id.</param>
        /// <param name="index">Index in <see cref="Buyback"/>.</param>
        /// <param name="reason">German reason if it fails.</param>
        bool TryBuyBack(string merchantId, int index, out string reason);
    }
}
