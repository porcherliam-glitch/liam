using System;
using System.Collections.Generic;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Currency amounts of one owner (gold <c>currency.gold</c>, later Aether shards and faction marks, GDD 04 8.1). Never
    /// negative; gold weighs nothing (GDD 04 1.3). Pure C#.
    /// </summary>
    public sealed class CurrencyWallet
    {
        private readonly Dictionary<string, int> _amounts = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <summary>All non-zero amounts (currency id → amount).</summary>
        public IReadOnlyDictionary<string, int> Amounts => _amounts;

        /// <summary>Amount of a currency (0 if none).</summary>
        /// <param name="currencyId">Currency id.</param>
        public int Get(string currencyId)
        {
            return currencyId != null && _amounts.TryGetValue(currencyId, out int amount) ? amount : 0;
        }

        /// <summary>Changes an amount; fails without change if the result would be negative or overflow.</summary>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="delta">Change.</param>
        /// <param name="newAmount">Amount afterwards (unchanged on failure).</param>
        /// <returns>True if changed (or delta 0).</returns>
        public bool TryChange(string currencyId, int delta, out int newAmount)
        {
            int current = Get(currencyId);
            newAmount = current;
            if (string.IsNullOrEmpty(currencyId))
            {
                return false;
            }

            long result = (long)current + delta;
            if (result < 0 || result > int.MaxValue)
            {
                return false;
            }

            newAmount = (int)result;
            Set(currencyId, newAmount);
            return true;
        }

        /// <summary>Sets an amount directly (loading a save); negative values become 0.</summary>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="amount">Amount.</param>
        public void Set(string currencyId, int amount)
        {
            if (string.IsNullOrEmpty(currencyId))
            {
                return;
            }

            if (amount <= 0)
            {
                _amounts.Remove(currencyId);
                return;
            }

            _amounts[currencyId] = amount;
        }

        /// <summary>Removes all amounts.</summary>
        public void Clear()
        {
            _amounts.Clear();
        }
    }
}
