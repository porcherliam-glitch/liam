using System;
using Aetherfall.Items;
using Aetherfall.Stats;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// The inventory service (architecture 11.6): containers per owner, currencies, the player's equipment and load, and the
    /// binding of equipment and load to the player's stats. Registered by <see cref="InventoryInstaller"/>.
    /// </summary>
    /// <remarks>
    /// Global events (architecture 4.3): <c>ItemPickedUp</c> and <c>InventoryChanged</c> on adding, <c>InventoryChanged</c>
    /// on removing, <c>CurrencyChanged</c>, <c>ItemEquipped</c>. Loading a save sends none of them; <see cref="Changed"/> (local
    /// C# event for UI and the player bridge) is raised after every change including loads. Main thread only.
    /// </remarks>
    public interface IInventoryService
    {
        /// <summary>Raised after every change of containers, currencies, equipment or load (also after loading).</summary>
        event Action Changed;

        /// <summary>Item data (items, affixes, loot tables).</summary>
        IItemCatalog Catalog { get; }

        /// <summary>The item generator (fixed pieces and random equipment).</summary>
        ItemGenerator Generator { get; }

        /// <summary>The player's bag.</summary>
        InventoryContainer PlayerContainer { get; }

        /// <summary>The player's equipment.</summary>
        Equipment PlayerEquipment { get; }

        /// <summary>The player's load (bag plus equipment against the stat CarryCapacity).</summary>
        EncumbranceState PlayerEncumbrance { get; }

        /// <summary>The bound player stats, or null before the player exists.</summary>
        StatCollection PlayerStats { get; }

        /// <summary>Counter that grows with every change (cheap "did anything change" check for views).</summary>
        int Revision { get; }

        /// <summary>
        /// Number of pieces of an item (for the player: bag plus equipment), e.g. for "owns the item" conditions. A hand-in with
        /// <see cref="TryRemove"/> takes only bag pieces: check it with <see cref="CountInBag"/>.
        /// </summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="itemId">Item id.</param>
        int CountOf(string ownerId, string itemId);

        /// <summary>Number of pieces of an item in the owner's container only (without equipment): what <see cref="TryRemove"/> can take.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="itemId">Item id.</param>
        int CountInBag(string ownerId, string itemId);

        /// <summary>Adds an instance (stackables merge). Sends <c>ItemPickedUp</c> and <c>InventoryChanged</c>.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="instance">Instance (ownership passes to the container).</param>
        /// <param name="sourceId">Source (loot table, chest id, quest id, <c>debug</c>).</param>
        bool TryAdd(string ownerId, ItemInstance instance, string sourceId);

        /// <summary>Creates fixed pieces of an item (base rarity) and adds them.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="count">Count.</param>
        /// <param name="sourceId">Source.</param>
        bool TryAddNew(string ownerId, string itemId, int count, string sourceId);

        /// <summary>
        /// Removes pieces of an item from the bag (never equipped ones). Fails without change if <see cref="CountInBag"/> is
        /// smaller than <paramref name="amount"/>.
        /// </summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Pieces.</param>
        /// <param name="reasonId">Reason (quest hand-in, crafting …) for logs.</param>
        bool TryRemove(string ownerId, string itemId, int amount, string reasonId);

        /// <summary>Amount of a currency.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="currencyId">Currency id.</param>
        int GetCurrency(string ownerId, string currencyId);

        /// <summary>Changes a currency (never below 0). Sends <c>CurrencyChanged</c> for the player.</summary>
        /// <param name="ownerId">Owner id.</param>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="delta">Change.</param>
        /// <param name="reasonId">Reason for logs.</param>
        bool TryChangeCurrency(string ownerId, string currencyId, int delta, string reasonId);

        /// <summary>Container of an owner (created on first use).</summary>
        /// <param name="ownerId">Owner id.</param>
        InventoryContainer GetContainer(string ownerId);

        /// <summary>Equips an item of the bag. Sends <c>ItemEquipped</c> for every changed slot.</summary>
        /// <param name="instanceId">Instance id in the bag.</param>
        /// <param name="slot">Target slot; <see cref="EquipmentSlot.None"/> = the suggested slot.</param>
        /// <param name="reason">German reason on failure.</param>
        bool TryEquip(string instanceId, EquipmentSlot slot, out string reason);

        /// <summary>Takes an item off into the bag (quick slots: clears the reference). Sends <c>ItemEquipped</c> with empty ids.</summary>
        /// <param name="slot">Slot.</param>
        /// <param name="reason">German reason on failure.</param>
        bool TryUnequip(EquipmentSlot slot, out string reason);

        /// <summary>
        /// Takes pieces out of the bag to drop them into the world (not locked, not quest items, not equipped). Sends
        /// <c>InventoryChanged</c>.
        /// </summary>
        /// <param name="instanceId">Instance id.</param>
        /// <param name="count">Pieces.</param>
        /// <param name="taken">The taken instance.</param>
        /// <param name="reason">German reason on failure.</param>
        bool TryTakeForDrop(string instanceId, int count, out ItemInstance taken, out string reason);

        /// <summary>Clears the "new" marker of an item.</summary>
        /// <param name="instanceId">Instance id.</param>
        void MarkSeen(string instanceId);

        /// <summary>Clears the "new" marker of all items ("Alle als gesehen").</summary>
        void MarkAllSeen();

        /// <summary>Binds the player's stats: equipment modifiers, armor class and load are applied (and kept up to date).</summary>
        /// <param name="stats">Player stats.</param>
        void AttachPlayerStats(StatCollection stats);

        /// <summary>Removes every modifier from the stats and unbinds them (player destroyed).</summary>
        /// <param name="stats">The stats passed to <see cref="AttachPlayerStats"/>.</param>
        void DetachPlayerStats(StatCollection stats);
    }
}
