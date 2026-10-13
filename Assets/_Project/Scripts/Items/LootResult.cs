using System.Collections.Generic;

namespace Aetherfall.Items
{
    /// <summary>Result of <see cref="LootRoller.Roll"/>: the table, the source and the drops in roll order (guaranteed ones first).</summary>
    public sealed class LootResult
    {
        private readonly List<LootDrop> _drops = new List<LootDrop>();

        /// <summary>Creates an empty result.</summary>
        /// <param name="tableId">Rolled table.</param>
        /// <param name="sourceId">Source of the roll.</param>
        public LootResult(string tableId, string sourceId)
        {
            TableId = tableId ?? string.Empty;
            SourceId = sourceId ?? string.Empty;
        }

        /// <summary>Id of the rolled (top level) table.</summary>
        public string TableId { get; }

        /// <summary>Source id of the roll.</summary>
        public string SourceId { get; }

        /// <summary>Drops in roll order.</summary>
        public IReadOnlyList<LootDrop> Drops => _drops;

        /// <summary>True if at least one item was dropped (currency does not count).</summary>
        public bool HasItems
        {
            get
            {
                for (int i = 0; i < _drops.Count; i++)
                {
                    if (!_drops[i].IsCurrency)
                    {
                        return true;
                    }
                }

                return false;
            }
        }

        /// <summary>Best rarity among the item drops (common if there are none).</summary>
        public ItemRarity BestRarity
        {
            get
            {
                ItemRarity best = ItemRarity.Common;
                for (int i = 0; i < _drops.Count; i++)
                {
                    ItemInstance item = _drops[i].Item;
                    if (item != null && RarityRules.Rank(item.Rarity) > RarityRules.Rank(best))
                    {
                        best = item.Rarity;
                    }
                }

                return best;
            }
        }

        /// <summary>Total amount of a currency in this result.</summary>
        /// <param name="currencyId">Currency id.</param>
        public int CurrencyTotal(string currencyId)
        {
            int total = 0;
            for (int i = 0; i < _drops.Count; i++)
            {
                if (_drops[i].IsCurrency && _drops[i].CurrencyId == currencyId)
                {
                    total += _drops[i].Amount;
                }
            }

            return total;
        }

        /// <summary>Appends a drop.</summary>
        /// <param name="drop">Drop.</param>
        public void Add(in LootDrop drop)
        {
            _drops.Add(drop);
        }
    }
}
