// Global events of items, inventory and loot (architecture 4.3, events #14–#17 and "LootDropped" of the items area).
// Several event structs of one area may share a file (architecture 15.2, rule 18). Payloads exactly as in table 4.3; slot
// and rarity are stable string ids (Aetherfall.Items EquipmentSlotIds / ItemRarityIds), because Events (no. 3) cannot
// see the enums of Items (no. 12) and Items does not reference Events (table 3.3).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player picked up items (loot, chest content, quest reward). Sender: Inventory. Receivers: quests, UI (message).
    /// Gold is reported by <see cref="CurrencyChanged"/>, not by this event.
    /// </summary>
    public readonly struct ItemPickedUp : IGameEvent
    {
        /// <summary>Item id, e.g. <c>item.material.wolfsfell</c>.</summary>
        public readonly string ItemId;

        /// <summary>Number of items picked up (at least 1).</summary>
        public readonly int Amount;

        /// <summary>Where the items came from: loot table, chest id, quest id or <c>debug</c>.</summary>
        public readonly string SourceId;

        /// <summary>Creates the event.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Number of items.</param>
        /// <param name="sourceId">Source id.</param>
        public ItemPickedUp(string itemId, int amount, string sourceId)
        {
            ItemId = itemId ?? string.Empty;
            Amount = amount;
            SourceId = sourceId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ItemPickedUp(" + ItemId + " x" + Amount + " from '" + SourceId + "')";
        }
    }

    /// <summary>
    /// The number of an item in a container changed (added, removed, dropped, used). Sender: Inventory. Receivers: quests,
    /// UI, condition watcher. Equipping does not change the count (equipped items still count as owned).
    /// </summary>
    public readonly struct InventoryChanged : IGameEvent
    {
        /// <summary>Owner of the container: <c>player</c>, <c>container.house.lager</c>, merchant id.</summary>
        public readonly string OwnerId;

        /// <summary>Item id.</summary>
        public readonly string ItemId;

        /// <summary>Count of this item after the change (container plus equipment).</summary>
        public readonly int NewCount;

        /// <summary>Change (positive = added).</summary>
        public readonly int Delta;

        /// <summary>Creates the event.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="newCount">Count after the change.</param>
        /// <param name="delta">Change.</param>
        public InventoryChanged(string ownerId, string itemId, int newCount, int delta)
        {
            OwnerId = ownerId ?? string.Empty;
            ItemId = itemId ?? string.Empty;
            NewCount = newCount;
            Delta = delta;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "InventoryChanged(" + OwnerId + ": " + ItemId + " = " + NewCount + " (" + (Delta >= 0 ? "+" : string.Empty) + Delta + "))";
        }
    }

    /// <summary>The amount of a currency of the player changed. Sender: Inventory. Receivers: UI, condition watcher.</summary>
    public readonly struct CurrencyChanged : IGameEvent
    {
        /// <summary>Currency id, e.g. <c>currency.gold</c>.</summary>
        public readonly string CurrencyId;

        /// <summary>Amount after the change.</summary>
        public readonly int NewAmount;

        /// <summary>Change (positive = gained).</summary>
        public readonly int Delta;

        /// <summary>Creates the event.</summary>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="newAmount">Amount after the change.</param>
        /// <param name="delta">Change.</param>
        public CurrencyChanged(string currencyId, int newAmount, int delta)
        {
            CurrencyId = currencyId ?? string.Empty;
            NewAmount = newAmount;
            Delta = delta;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CurrencyChanged(" + CurrencyId + " = " + NewAmount + " (" + (Delta >= 0 ? "+" : string.Empty) + Delta + "))";
        }
    }

    /// <summary>
    /// The content of an equipment slot of the player changed. Sender: Inventory. Receivers: Player (weapon, stats), combat,
    /// UI. An emptied slot is reported with empty <see cref="ItemInstanceId"/> and <see cref="ItemId"/>.
    /// </summary>
    public readonly struct ItemEquipped : IGameEvent
    {
        /// <summary>Stable slot id (Aetherfall.Items.EquipmentSlotIds), e.g. <c>haupthand</c>, <c>ring_1</c>.</summary>
        public readonly string Slot;

        /// <summary>Instance id of the equipped item (16 hex digits); empty if the slot was emptied.</summary>
        public readonly string ItemInstanceId;

        /// <summary>Item id of the equipped item; empty if the slot was emptied.</summary>
        public readonly string ItemId;

        /// <summary>Creates the event.</summary>
        /// <param name="slot">Slot id.</param>
        /// <param name="itemInstanceId">Instance id, or empty.</param>
        /// <param name="itemId">Item id, or empty.</param>
        public ItemEquipped(string slot, string itemInstanceId, string itemId)
        {
            Slot = slot ?? string.Empty;
            ItemInstanceId = itemInstanceId ?? string.Empty;
            ItemId = itemId ?? string.Empty;
        }

        /// <summary>True if the slot was emptied.</summary>
        public bool IsEmpty => ItemInstanceId.Length == 0;

        /// <inheritdoc />
        public override string ToString()
        {
            return "ItemEquipped(" + Slot + ": " + (IsEmpty ? "empty" : ItemId + " #" + ItemInstanceId) + ")";
        }
    }

    /// <summary>
    /// A loot table was rolled and produced items (enemy drop, chest). Sender: Inventory (loot service). Receivers:
    /// telemetry (GDD 04 5.10: drops per hour by best rarity).
    /// </summary>
    public readonly struct LootDropped : IGameEvent
    {
        /// <summary>Loot table id, e.g. <c>loot.enemy.wolf.grauwolf</c>.</summary>
        public readonly string LootTableId;

        /// <summary>Stable id of the best rarity among the dropped items (Aetherfall.Items.ItemRarityIds, e.g. <c>selten</c>).</summary>
        public readonly string BestRarity;

        /// <summary>Creates the event.</summary>
        /// <param name="lootTableId">Loot table id.</param>
        /// <param name="bestRarity">Rarity id of the best item.</param>
        public LootDropped(string lootTableId, string bestRarity)
        {
            LootTableId = lootTableId ?? string.Empty;
            BestRarity = bestRarity ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "LootDropped(" + LootTableId + ", best " + BestRarity + ")";
        }
    }
}
