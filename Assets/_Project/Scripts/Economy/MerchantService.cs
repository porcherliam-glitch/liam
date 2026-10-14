using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Utilities;

namespace Aetherfall.Economy
{
    /// <summary>
    /// Merchants of GDD 04 8.2 and 8.4 (pure logic over the inventory): the stock comes back every <c>restockDays</c> game days,
    /// the gold grows by half its maximum per game day, sold items stay for buyback (at most 20) until the restock, selling the
    /// same item again pays 5 % less each time. Time is the playtime (a game day is 48 minutes, GDD 01 7); the state is
    /// computed when a merchant is looked at, there is no tick (architecture 11.15).
    /// </summary>
    public sealed class MerchantService : IMerchantService
    {
        /// <summary>Length of a game day in seconds of playtime (48 minutes).</summary>
        public const double DaySeconds = 48 * 60;

        /// <summary>Most sold items a merchant keeps for buyback.</summary>
        public const int BuybackLimit = 20;

        /// <summary>Owner id of the player in the inventory.</summary>
        public const string PlayerId = "player";

        private readonly IInventoryService _inventory;
        private readonly IPlaytimeClock _clock;
        private readonly Func<int> _playerLevel;
        private readonly IRandom _random;
        private readonly List<MerchantDefinition> _merchants = new List<MerchantDefinition>();
        private readonly Dictionary<string, MerchantDefinition> _byId = new Dictionary<string, MerchantDefinition>(StringComparer.Ordinal);
        private readonly Dictionary<string, MerchantState> _states = new Dictionary<string, MerchantState>(StringComparer.Ordinal);
        private readonly List<MerchantOffer> _offers = new List<MerchantOffer>();

        /// <summary>Creates the service.</summary>
        /// <param name="inventory">Inventory (player gold and bag).</param>
        /// <param name="clock">Playtime (restock and gold refill).</param>
        /// <param name="playerLevel">Current player level (item level of bought equipment); null = 1.</param>
        /// <param name="merchants">Merchant definitions.</param>
        /// <param name="randomSeed">Seed for the instances of bought items.</param>
        public MerchantService(IInventoryService inventory, IPlaytimeClock clock, Func<int> playerLevel, IEnumerable<MerchantDefinition> merchants,
            ulong randomSeed)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _clock = clock;
            _playerLevel = playerLevel ?? (() => 1);
            _random = new Pcg32Random(randomSeed, 0x7a3c5e1dUL);
            if (merchants != null)
            {
                foreach (MerchantDefinition merchant in merchants)
                {
                    if (merchant != null && merchant.Id.Length > 0 && !_byId.ContainsKey(merchant.Id))
                    {
                        _merchants.Add(merchant);
                        _byId[merchant.Id] = merchant;
                    }
                }
            }
        }

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <inheritdoc />
        public IReadOnlyList<MerchantDefinition> Merchants => _merchants;

        /// <inheritdoc />
        public bool TryGetForNpc(string npcId, out MerchantDefinition merchant)
        {
            for (int i = 0; i < _merchants.Count; i++)
            {
                if (string.Equals(_merchants[i].NpcId, npcId, StringComparison.Ordinal))
                {
                    merchant = _merchants[i];
                    return true;
                }
            }

            merchant = null;
            return false;
        }

        /// <inheritdoc />
        public int Gold(string merchantId)
        {
            return TryState(merchantId, out _, out MerchantState state) ? state.Gold : 0;
        }

        /// <inheritdoc />
        public IReadOnlyList<MerchantOffer> Offers(string merchantId)
        {
            _offers.Clear();
            if (!TryState(merchantId, out MerchantDefinition merchant, out MerchantState state))
            {
                return _offers;
            }

            IItemCatalog catalog = _inventory.Catalog;
            int level = OfferLevel(merchant);
            float charisma = EffectiveCharisma();
            for (int i = 0; i < merchant.Stock.Count; i++)
            {
                MerchantStockEntry entry = merchant.Stock[i];
                if (state.Stock[i] <= 0 || !catalog.TryGetItem(entry.ItemId, out ItemSpec spec))
                {
                    continue;
                }

                int itemLevel = spec.IsEquipment ? level : 1;
                float value = spec.IsEquipment ? ItemFormulas.TradeValue(spec.Value, itemLevel, spec.BaseRarity) : spec.Value;
                int price = MerchantPricing.BuyPrice(value, charisma, merchant.BuyRegionFactor(spec.Id));
                _offers.Add(new MerchantOffer(i, spec.Id, spec.DisplayName, spec.Category, itemLevel, state.Stock[i], price));
            }

            return _offers;
        }

        /// <inheritdoc />
        public int SellPrice(string merchantId, ItemInstance item)
        {
            if (item == null || !TryState(merchantId, out MerchantDefinition merchant, out MerchantState state) ||
                !_inventory.Catalog.TryGetItem(item.ItemId, out ItemSpec spec) || spec.IsQuestItem)
            {
                return 0;
            }

            state.Sold.TryGetValue(item.ItemId, out int sold);
            return MerchantPricing.SellPrice(ItemStats.TradeValue(spec, item), spec.Category, EffectiveCharisma(), merchant.SellRegionFactor(spec.Id), sold);
        }

        /// <inheritdoc />
        public IReadOnlyList<BuybackEntry> Buyback(string merchantId)
        {
            return TryState(merchantId, out _, out MerchantState state) ? (IReadOnlyList<BuybackEntry>)state.Buyback : Array.Empty<BuybackEntry>();
        }

        /// <inheritdoc />
        public bool TryBuy(string merchantId, int offerIndex, int count, out string reason)
        {
            if (!TryState(merchantId, out MerchantDefinition merchant, out MerchantState state) || offerIndex < 0 || offerIndex >= merchant.Stock.Count)
            {
                reason = "Diese Ware gibt es hier nicht.";
                return false;
            }

            count = Math.Max(1, count);
            if (state.Stock[offerIndex] < count)
            {
                reason = state.Stock[offerIndex] <= 0 ? "Ausverkauft." : "So viele hat der Händler nicht.";
                return false;
            }

            MerchantOffer offer = FindOffer(merchantId, offerIndex);
            int total = offer.Price * count;
            if (_inventory.GetCurrency(PlayerId, CurrencyIds.Gold) < total)
            {
                reason = "Nicht genug Gold (" + total + " nötig).";
                return false;
            }

            if (!_inventory.Catalog.TryGetItem(offer.ItemId, out ItemSpec spec))
            {
                reason = "Diese Ware gibt es hier nicht.";
                return false;
            }

            ItemInstance bought = _inventory.Generator.CreateFixed(spec, offer.ItemLevel, spec.BaseRarity, count, _random);
            if (!_inventory.TryAdd(PlayerId, bought, merchant.Id))
            {
                reason = "Kein Platz im Rucksack.";
                return false;
            }

            _inventory.TryChangeCurrency(PlayerId, CurrencyIds.Gold, -total, merchant.Id);
            state.Stock[offerIndex] -= count;
            state.Gold = Math.Min(merchant.MaxGold * 4, state.Gold + total);
            Changed();
            Log.Info(LogCategory.Data, "Merchant '" + merchant.Id + "': sold " + count + "× " + offer.ItemId + " for " + total + " gold.");
            reason = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public bool TrySell(string merchantId, string instanceId, int count, out string reason)
        {
            if (!TryState(merchantId, out MerchantDefinition merchant, out MerchantState state))
            {
                reason = "Hier kann man nicht handeln.";
                return false;
            }

            ItemInstance item = FindInBag(instanceId);
            if (item == null)
            {
                reason = "Gegenstand nicht im Rucksack.";
                return false;
            }

            if (item.IsLocked)
            {
                reason = "Gesperrt (Schloss) – erst entsperren.";
                return false;
            }

            int each = SellPrice(merchantId, item);
            if (each <= 0)
            {
                reason = "Das kauft hier niemand.";
                return false;
            }

            count = Math.Max(1, Math.Min(count, item.Count));
            int total = each * count;
            if (state.Gold < total)
            {
                reason = "Der Händler hat nicht genug Gold (" + state.Gold + ").";
                return false;
            }

            if (!_inventory.TryTakeForDrop(instanceId, count, out ItemInstance taken, out reason))
            {
                return false;
            }

            _inventory.TryChangeCurrency(PlayerId, CurrencyIds.Gold, total, merchant.Id);
            state.Gold -= total;
            state.Sold.TryGetValue(taken.ItemId, out int sold);
            state.Sold[taken.ItemId] = sold + count;
            state.Buyback.Insert(0, new BuybackEntry(taken, total));
            if (state.Buyback.Count > BuybackLimit)
            {
                state.Buyback.RemoveAt(state.Buyback.Count - 1);
            }

            Changed();
            Log.Info(LogCategory.Data, "Merchant '" + merchant.Id + "': bought " + count + "× " + taken.ItemId + " for " + total + " gold.");
            reason = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public bool TryBuyBack(string merchantId, int index, out string reason)
        {
            if (!TryState(merchantId, out MerchantDefinition merchant, out MerchantState state) || index < 0 || index >= state.Buyback.Count)
            {
                reason = "Nichts zum Zurückkaufen.";
                return false;
            }

            BuybackEntry entry = state.Buyback[index];
            if (_inventory.GetCurrency(PlayerId, CurrencyIds.Gold) < entry.Price)
            {
                reason = "Nicht genug Gold (" + entry.Price + " nötig).";
                return false;
            }

            if (!_inventory.TryAdd(PlayerId, entry.Item, merchant.Id))
            {
                reason = "Kein Platz im Rucksack.";
                return false;
            }

            _inventory.TryChangeCurrency(PlayerId, CurrencyIds.Gold, -entry.Price, merchant.Id);
            state.Gold += entry.Price;
            if (state.Sold.TryGetValue(entry.Item.ItemId, out int sold))
            {
                state.Sold[entry.Item.ItemId] = Math.Max(0, sold - entry.Item.Count);
            }

            state.Buyback.RemoveAt(index);
            Changed();
            reason = string.Empty;
            return true;
        }

        /// <summary>Saves the state of every merchant that was visited.</summary>
        public MerchantsDto Capture()
        {
            var dto = new MerchantsDto();
            foreach (KeyValuePair<string, MerchantState> pair in _states)
            {
                MerchantState state = pair.Value;
                var entry = new MerchantDto { Gold = state.Gold, RestockPeriod = state.RestockPeriod, GoldDay = state.GoldDay };
                entry.Stock.AddRange(state.Stock);
                foreach (KeyValuePair<string, int> sold in state.Sold)
                {
                    entry.Sold[sold.Key] = sold.Value;
                }

                foreach (BuybackEntry buyback in state.Buyback)
                {
                    entry.Buyback.Add(new BuybackDto { Item = InventoryDtoMapper.ToDto(buyback.Item), Price = buyback.Price });
                }

                dto.Merchants[pair.Key] = entry;
            }

            return dto;
        }

        /// <summary>Restores the merchants of a save (null: a new game, every merchant starts full).</summary>
        /// <param name="dto">Saved state.</param>
        public void Restore(MerchantsDto dto)
        {
            _states.Clear();
            if (dto != null)
            {
                foreach (KeyValuePair<string, MerchantDto> pair in dto.Merchants)
                {
                    if (!_byId.TryGetValue(pair.Key, out MerchantDefinition merchant) || pair.Value == null)
                    {
                        continue;
                    }

                    MerchantState state = NewState(merchant);
                    state.Gold = Math.Max(0, pair.Value.Gold);
                    state.RestockPeriod = pair.Value.RestockPeriod;
                    state.GoldDay = pair.Value.GoldDay;
                    for (int i = 0; i < state.Stock.Length && i < pair.Value.Stock.Count; i++)
                    {
                        state.Stock[i] = Math.Max(0, pair.Value.Stock[i]);
                    }

                    foreach (KeyValuePair<string, int> sold in pair.Value.Sold)
                    {
                        state.Sold[sold.Key] = sold.Value;
                    }

                    foreach (BuybackDto buyback in pair.Value.Buyback)
                    {
                        if (buyback?.Item != null && InventoryDtoMapper.TryFromDto(buyback.Item, _inventory.Catalog, out ItemInstance item, out _))
                        {
                            state.Buyback.Add(new BuybackEntry(item, buyback.Price));
                        }
                    }

                    _states[merchant.Id] = state;
                }
            }

            Changed();
        }

        private bool TryState(string merchantId, out MerchantDefinition merchant, out MerchantState state)
        {
            state = null;
            if (merchantId == null || !_byId.TryGetValue(merchantId, out merchant))
            {
                merchant = null;
                return false;
            }

            double playtime = _clock != null ? _clock.PlaytimeSeconds : 0.0;
            long period = (long)Math.Floor(playtime / (merchant.RestockDays * DaySeconds));
            long day = (long)Math.Floor(playtime / DaySeconds);
            if (!_states.TryGetValue(merchant.Id, out state))
            {
                state = NewState(merchant);
                state.RestockPeriod = period;
                state.GoldDay = day;
                _states[merchant.Id] = state;
            }

            if (period != state.RestockPeriod)
            {
                // Restock: the stock comes back, demand and buyback start over.
                for (int i = 0; i < state.Stock.Length; i++)
                {
                    state.Stock[i] = merchant.Stock[i].Count;
                }

                state.Sold.Clear();
                state.Buyback.Clear();
                state.RestockPeriod = period;
                Changed();
            }

            if (day > state.GoldDay)
            {
                state.Gold = (int)Math.Min(Math.Max(state.Gold, merchant.MaxGold), state.Gold + (day - state.GoldDay) * (merchant.MaxGold / 2L));
                state.GoldDay = day;
                Changed();
            }

            return true;
        }

        private static MerchantState NewState(MerchantDefinition merchant)
        {
            var state = new MerchantState(merchant.Stock.Count) { Gold = merchant.MaxGold };
            for (int i = 0; i < merchant.Stock.Count; i++)
            {
                state.Stock[i] = merchant.Stock[i].Count;
            }

            return state;
        }

        private MerchantOffer FindOffer(string merchantId, int stockIndex)
        {
            IReadOnlyList<MerchantOffer> offers = Offers(merchantId);
            for (int i = 0; i < offers.Count; i++)
            {
                if (offers[i].Index == stockIndex)
                {
                    return offers[i];
                }
            }

            return default;
        }

        private ItemInstance FindInBag(string instanceId)
        {
            IReadOnlyList<ItemInstance> bag = _inventory.PlayerContainer.Entries;
            for (int i = 0; i < bag.Count; i++)
            {
                if (string.Equals(bag[i].InstanceId, instanceId, StringComparison.Ordinal))
                {
                    return bag[i];
                }
            }

            return null;
        }

        private int OfferLevel(MerchantDefinition merchant)
        {
            // GDD 04 5.x: merchant goods have min(player level, top of the region band); specialists +2.
            int level = Math.Max(1, Math.Min(_playerLevel(), merchant.RegionLevel + 3));
            return merchant.Kind == MerchantKind.Weaponsmith ? level + 2 : level;
        }

        private float EffectiveCharisma()
        {
            StatCollection stats = _inventory.PlayerStats;
            return stats != null ? StatFormulas.EffectivePoints(stats.Get(StatId.Charisma)) : 0f;
        }

        private void Changed()
        {
            Revision++;
        }

        private sealed class MerchantState
        {
            public MerchantState(int stockLines)
            {
                Stock = new int[stockLines];
            }

            public int Gold { get; set; }

            public int[] Stock { get; }

            public Dictionary<string, int> Sold { get; } = new Dictionary<string, int>(StringComparer.Ordinal);

            public List<BuybackEntry> Buyback { get; } = new List<BuybackEntry>();

            public long RestockPeriod { get; set; }

            public long GoldDay { get; set; }
        }
    }
}
