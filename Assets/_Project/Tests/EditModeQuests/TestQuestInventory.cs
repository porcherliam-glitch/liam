using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Quests;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Stand-in for the player inventory in quest tests: item counts and gold. Implements <see cref="IQuestInventory"/> (collect
    /// objectives count it) and publishes <c>InventoryChanged</c> like the real inventory, so objectives react to it.
    /// </summary>
    public sealed class TestQuestInventory : IQuestInventory
    {
        private readonly Dictionary<string, int> _items = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly IEventBus _bus;

        /// <summary>Creates the inventory.</summary>
        /// <param name="bus">Bus for <c>InventoryChanged</c> (null = no events).</param>
        public TestQuestInventory(IEventBus bus)
        {
            _bus = bus;
        }

        /// <summary>Gold of the player.</summary>
        public int Gold { get; private set; }

        /// <inheritdoc />
        public int CountOf(string itemId)
        {
            return itemId != null && _items.TryGetValue(itemId, out int count) ? count : 0;
        }

        /// <summary>Adds (or with a negative amount removes) items and publishes <c>InventoryChanged</c>.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Change.</param>
        public void Add(string itemId, int amount)
        {
            int count = Math.Max(0, CountOf(itemId) + amount);
            int delta = count - CountOf(itemId);
            if (delta == 0)
            {
                return;
            }

            _items[itemId] = count;
            if (_bus != null)
            {
                _bus.Publish(new InventoryChanged(SubjectIds.Player, itemId, count, delta));
            }
        }

        /// <summary>Adds gold.</summary>
        /// <param name="amount">Amount.</param>
        public void AddGold(int amount)
        {
            Gold += amount;
        }
    }
}
