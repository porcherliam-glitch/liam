using System.Collections.Generic;
using Aetherfall.Economy;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>One row of the trade screen.</summary>
    public readonly struct TradeRow
    {
        /// <summary>Creates the row.</summary>
        public TradeRow(string name, string category, int itemLevel, int count, int price, bool affordable, int offerIndex, string instanceId, int buybackIndex)
        {
            Name = name;
            Category = category;
            ItemLevel = itemLevel;
            Count = count;
            Price = price;
            Affordable = affordable;
            OfferIndex = offerIndex;
            InstanceId = instanceId;
            BuybackIndex = buybackIndex;
        }

        /// <summary>Item name.</summary>
        public string Name { get; }

        /// <summary>Category text (German).</summary>
        public string Category { get; }

        /// <summary>Item level.</summary>
        public int ItemLevel { get; }

        /// <summary>Pieces (offer left, stack in the bag, sold pieces).</summary>
        public int Count { get; }

        /// <summary>Price of one piece (buyback: of the whole entry).</summary>
        public int Price { get; }

        /// <summary>False if the player or the merchant lacks the gold for one piece (row shown dimmed).</summary>
        public bool Affordable { get; }

        /// <summary>Stock index (page "Kaufen"), else −1.</summary>
        public int OfferIndex { get; }

        /// <summary>Instance id in the bag (page "Verkaufen"), else empty.</summary>
        public string InstanceId { get; }

        /// <summary>Index in the buyback list (page "Zurückkaufen"), else −1.</summary>
        public int BuybackIndex { get; }

        /// <summary>Second row line: "Waffe · Stufe 6 · 2×".</summary>
        public string Info => UiTexts.Format("fmt-trade-row-info", Category, ItemLevel.ToString(), Count.ToString());
    }

    /// <summary>Builds the rows of the trade screen from the merchant service and the inventory (pure logic, tested).</summary>
    public static class TradeModel
    {
        /// <summary>Fills <paramref name="result"/> with the rows of a page.</summary>
        /// <param name="merchants">Merchant service.</param>
        /// <param name="inventory">Inventory.</param>
        /// <param name="merchantId">Merchant id.</param>
        /// <param name="page">Page.</param>
        /// <param name="result">Receives the rows (cleared first).</param>
        public static void Collect(IMerchantService merchants, IInventoryService inventory, string merchantId, TradePage page, List<TradeRow> result)
        {
            result.Clear();
            int playerGold = inventory.GetCurrency(MerchantService.PlayerId, CurrencyIds.Gold);
            switch (page)
            {
                case TradePage.Buy:
                    foreach (MerchantOffer offer in merchants.Offers(merchantId))
                    {
                        result.Add(new TradeRow(offer.Name, CategoryText(offer.Category), offer.ItemLevel, offer.Count, offer.Price, offer.Price <= playerGold, offer.Index,
                            string.Empty, -1));
                    }

                    break;
                case TradePage.Sell:
                {
                    int merchantGold = merchants.Gold(merchantId);
                    IReadOnlyList<ItemInstance> bag = inventory.PlayerContainer.Entries;
                    for (int i = 0; i < bag.Count; i++)
                    {
                        ItemInstance item = bag[i];
                        int price = merchants.SellPrice(merchantId, item);
                        if (price <= 0 || !inventory.Catalog.TryGetItem(item.ItemId, out ItemSpec spec))
                        {
                            continue;
                        }

                        result.Add(new TradeRow(spec.DisplayName, CategoryText(spec.Category), item.ItemLevel, item.Count, price, price <= merchantGold, -1,
                            item.InstanceId, -1));
                    }

                    break;
                }

                default:
                {
                    IReadOnlyList<BuybackEntry> sold = merchants.Buyback(merchantId);
                    for (int i = 0; i < sold.Count; i++)
                    {
                        ItemInstance item = sold[i].Item;
                        string name = inventory.Catalog.TryGetItem(item.ItemId, out ItemSpec spec) ? spec.DisplayName : item.ItemId;
                        ItemCategory category = spec != null ? spec.Category : ItemCategory.Misc;
                        result.Add(new TradeRow(name, CategoryText(category), item.ItemLevel, item.Count, sold[i].Price, sold[i].Price <= playerGold, -1,
                            string.Empty, i));
                    }

                    break;
                }
            }
        }

        /// <summary>German name of an item category.</summary>
        /// <param name="category">Category.</param>
        public static string CategoryText(ItemCategory category)
        {
            switch (category)
            {
                case ItemCategory.Weapon: return UiTexts.Get("item-category-weapon");
                case ItemCategory.Armor: return UiTexts.Get("item-category-armor");
                case ItemCategory.Jewelry: return UiTexts.Get("item-category-jewelry");
                case ItemCategory.Consumable: return UiTexts.Get("item-category-consumable");
                case ItemCategory.Material: return UiTexts.Get("item-category-material");
                case ItemCategory.QuestItem: return UiTexts.Get("item-category-quest");
                case ItemCategory.Book: return UiTexts.Get("item-category-book");
                default: return UiTexts.Get("item-category-misc");
            }
        }
    }
}
