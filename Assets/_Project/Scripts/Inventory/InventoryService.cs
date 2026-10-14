using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Utilities;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Default <see cref="IInventoryService"/> (architecture 11.6): player bag, other containers on demand, wallets, the
    /// player's equipment with the slot rules, the load stage and the stat binding (<see cref="PlayerStatBinding"/>). Pure C#
    /// service created by <see cref="InventoryInstaller"/>; saved through <see cref="InventorySaveable"/>.
    /// </summary>
    /// <remarks>
    /// A new service (and a new game) starts with the <see cref="StartingKit"/>. Loads replace the state through
    /// <see cref="LoadState"/> without global events. The load stage is re-evaluated after every change and when the carry
    /// capacity of the bound stats changes (strength affixes, bags).
    /// </remarks>
    public sealed class InventoryService : IInventoryService
    {
        private readonly IEventBus _eventBus;
        private readonly IItemCatalog _catalog;
        private readonly ItemGenerator _generator;
        private readonly IRandom _ids;
        private StartingKit _kit;
        private readonly Dictionary<string, InventoryContainer> _containers = new Dictionary<string, InventoryContainer>(StringComparer.Ordinal);
        private readonly Dictionary<string, CurrencyWallet> _wallets = new Dictionary<string, CurrencyWallet>(StringComparer.Ordinal);
        private readonly Equipment _equipment;
        private readonly PlayerStatBinding _binding;
        private EncumbranceState _encumbrance;

        /// <summary>Creates the service with the starting kit applied.</summary>
        /// <param name="eventBus">Bus for the global inventory events.</param>
        /// <param name="catalog">Item data.</param>
        /// <param name="idSeed">Seed of the instance ids of split stacks and start items.</param>
        /// <param name="kit">Starting equipment (null = empty).</param>
        public InventoryService(IEventBus eventBus, IItemCatalog catalog, ulong idSeed, StartingKit kit)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _ids = new Pcg32Random(idSeed, 0x5bd1e995UL);
            _generator = new ItemGenerator(catalog.Affixes);
            _kit = kit ?? StartingKit.Empty;
            _equipment = new Equipment(catalog);
            _binding = new PlayerStatBinding(catalog);
            PlayerContainer = GetContainer(InventoryOwners.Player);
            ResetToStartingKit();
        }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public IItemCatalog Catalog => _catalog;

        /// <inheritdoc />
        public ItemGenerator Generator => _generator;

        /// <inheritdoc />
        public InventoryContainer PlayerContainer { get; }

        /// <inheritdoc />
        public Equipment PlayerEquipment => _equipment;

        /// <inheritdoc />
        public EncumbranceState PlayerEncumbrance => _encumbrance;

        /// <inheritdoc />
        public StatCollection PlayerStats => _binding.Stats;

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <summary>The player's wallet.</summary>
        public CurrencyWallet PlayerWallet => GetWallet(InventoryOwners.Player);

        /// <summary>Level of the player for the level requirement (no stats bound = no requirement).</summary>
        public int PlayerLevel => _binding.Stats != null ? (int)Math.Floor(_binding.Stats.Get(StatId.Level)) : int.MaxValue;

        /// <inheritdoc />
        public int CountOf(string ownerId, string itemId)
        {
            int count = GetContainer(ownerId).CountOf(itemId);
            return IsPlayer(ownerId) ? count + _equipment.CountOf(itemId) : count;
        }

        /// <inheritdoc />
        public int CountInBag(string ownerId, string itemId)
        {
            return GetContainer(ownerId).CountOf(itemId);
        }

        /// <inheritdoc />
        public bool TryAdd(string ownerId, ItemInstance instance, string sourceId)
        {
            if (instance == null)
            {
                return false;
            }

            string itemId = instance.ItemId;
            int amount = instance.Count;
            if (!GetContainer(ownerId).TryAdd(instance))
            {
                Log.Warning(LogCategory.Data, "Inventory of '" + ownerId + "': '" + itemId + "' could not be added (unknown item or 1000 entries).");
                return false;
            }

            if (IsPlayer(ownerId))
            {
                var picked = new ItemPickedUp(itemId, amount, sourceId);
                _eventBus.Publish(in picked);
            }

            var changed = new InventoryChanged(ownerId, itemId, CountOf(ownerId, itemId), amount);
            _eventBus.Publish(in changed);
            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public bool TryAddNew(string ownerId, string itemId, int count, string sourceId)
        {
            if (count < 1 || !_catalog.TryGetItem(itemId, out ItemSpec spec))
            {
                return false;
            }

            return TryAdd(ownerId, _generator.CreateFixed(spec, 1, spec.BaseRarity, count, _ids), sourceId);
        }

        /// <inheritdoc />
        public bool TryRemove(string ownerId, string itemId, int amount, string reasonId)
        {
            InventoryContainer container = GetContainer(ownerId);
            if (amount < 1 || container.CountOf(itemId) < amount)
            {
                return false;
            }

            container.RemoveItem(itemId, amount);
            var changed = new InventoryChanged(ownerId, itemId, CountOf(ownerId, itemId), -amount);
            _eventBus.Publish(in changed);
            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public int GetCurrency(string ownerId, string currencyId)
        {
            return GetWallet(ownerId).Get(currencyId);
        }

        /// <inheritdoc />
        public bool TryChangeCurrency(string ownerId, string currencyId, int delta, string reasonId)
        {
            if (!GetWallet(ownerId).TryChange(currencyId, delta, out int amount))
            {
                return false;
            }

            if (delta != 0 && IsPlayer(ownerId))
            {
                var changed = new CurrencyChanged(currencyId, amount, delta);
                _eventBus.Publish(in changed);
            }

            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public InventoryContainer GetContainer(string ownerId)
        {
            string key = ownerId ?? string.Empty;
            if (!_containers.TryGetValue(key, out InventoryContainer container))
            {
                container = new InventoryContainer(key, _catalog, _ids);
                _containers.Add(key, container);
            }

            return container;
        }

        /// <inheritdoc />
        public bool TryEquip(string instanceId, EquipmentSlot slot, out string reason)
        {
            ItemInstance item = PlayerContainer.Find(instanceId);
            if (item == null || !_catalog.TryGetItem(item.ItemId, out ItemSpec spec))
            {
                reason = "Gegenstand nicht im Rucksack.";
                return false;
            }

            if (slot == EquipmentSlot.None)
            {
                slot = _equipment.SuggestSlot(spec);
            }

            if (!_equipment.CanEquip(spec, item, slot, PlayerLevel, out reason))
            {
                return false;
            }

            if (EquipmentSlotIds.IsQuickSlot(slot))
            {
                item.SetFlags(ItemFlags.New, false);
                _equipment.SetQuickSlot(slot, item.ItemId);
                PublishEquipped(slot, item);
                AfterChange();
                return true;
            }

            bool freeOffHand = slot == EquipmentSlot.MainHand && spec.EquipKind == EquipKind.TwoHanded && _equipment.Get(EquipmentSlot.OffHand) != null;
            int returning = (_equipment.Get(slot) != null ? 1 : 0) + (freeOffHand ? 1 : 0);
            if (PlayerContainer.Entries.Count - 1 + returning > InventoryContainer.MaxEntries)
            {
                reason = "Der Rucksack ist voll (1000 Einträge).";
                return false;
            }

            item.SetFlags(ItemFlags.New, false);
            if (freeOffHand)
            {
                MoveToBag(EquipmentSlot.OffHand);
            }

            PlayerContainer.RemoveInstance(instanceId);
            ItemInstance previous = _equipment.Set(slot, item);
            if (previous != null)
            {
                _binding.RemoveItem(previous);
                PlayerContainer.AddRaw(previous);
            }

            _binding.ApplyItem(item);
            _binding.ApplyArmorClass(_equipment.ArmorClass);
            PublishEquipped(slot, item);
            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public bool TryUnequip(EquipmentSlot slot, out string reason)
        {
            reason = string.Empty;
            if (EquipmentSlotIds.IsQuickSlot(slot))
            {
                if (string.IsNullOrEmpty(_equipment.GetQuickSlot(slot)))
                {
                    reason = "Der Schnellslot ist leer.";
                    return false;
                }

                _equipment.SetQuickSlot(slot, string.Empty);
                PublishEquipped(slot, null);
                AfterChange();
                return true;
            }

            if (_equipment.Get(slot) == null)
            {
                reason = "Der Platz ist leer.";
                return false;
            }

            if (PlayerContainer.Entries.Count >= InventoryContainer.MaxEntries)
            {
                reason = "Der Rucksack ist voll (1000 Einträge).";
                return false;
            }

            MoveToBag(slot);
            _binding.ApplyArmorClass(_equipment.ArmorClass);
            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public bool TryTakeForDrop(string instanceId, int count, out ItemInstance taken, out string reason)
        {
            taken = null;
            ItemInstance item = PlayerContainer.Find(instanceId);
            if (item == null)
            {
                reason = _equipment.SlotOf(instanceId) != EquipmentSlot.None ? "Erst ablegen, dann wegwerfen." : "Gegenstand nicht im Rucksack.";
                return false;
            }

            _catalog.TryGetItem(item.ItemId, out ItemSpec spec);
            if (spec != null && spec.IsQuestItem)
            {
                reason = "Questgegenstände kann man nicht wegwerfen.";
                return false;
            }

            if (item.IsLocked)
            {
                reason = "Gesperrt (Schloss) – erst entsperren.";
                return false;
            }

            taken = PlayerContainer.Take(instanceId, Math.Max(1, count));
            if (taken == null)
            {
                reason = "Gegenstand nicht im Rucksack.";
                return false;
            }

            reason = string.Empty;
            var changed = new InventoryChanged(InventoryOwners.Player, taken.ItemId, CountOf(InventoryOwners.Player, taken.ItemId), -taken.Count);
            _eventBus.Publish(in changed);
            AfterChange();
            return true;
        }

        /// <inheritdoc />
        public void MarkSeen(string instanceId)
        {
            ItemInstance item = PlayerContainer.Find(instanceId);
            if (item != null && item.IsNew)
            {
                item.SetFlags(ItemFlags.New, false);
                Notify();
            }
        }

        /// <inheritdoc />
        public void MarkAllSeen()
        {
            IReadOnlyList<ItemInstance> entries = PlayerContainer.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                entries[i].SetFlags(ItemFlags.New, false);
            }

            Notify();
        }

        /// <inheritdoc />
        public void AttachPlayerStats(StatCollection stats)
        {
            if (stats == null || ReferenceEquals(stats, _binding.Stats))
            {
                return;
            }

            DetachPlayerStats(_binding.Stats);
            stats.Changed += OnStatChanged;
            RefreshEncumbrance(false);
            _binding.Attach(stats, _equipment, _encumbrance.Level);
            RefreshEncumbrance(true);
            Notify();
        }

        /// <inheritdoc />
        public void DetachPlayerStats(StatCollection stats)
        {
            if (stats == null || !ReferenceEquals(stats, _binding.Stats))
            {
                return;
            }

            stats.Changed -= OnStatChanged;
            _binding.Detach();
            RefreshEncumbrance(false);
        }

        /// <inheritdoc />
        public void SetStartingKit(StartingKit kit)
        {
            _kit = kit ?? StartingKit.Empty;
        }

        /// <summary>Resets to the starting kit (new game): bag, equipment, quick slots and gold; no global events.</summary>
        public void ResetToStartingKit()
        {
            ClearPlayer();
            IReadOnlyList<StartingKitItem> items = _kit.Items;
            for (int i = 0; i < items.Count; i++)
            {
                StartingKitItem entry = items[i];
                if (!_catalog.TryGetItem(entry.ItemId, out ItemSpec spec))
                {
                    Log.Warning(LogCategory.Data, "Starting equipment names the unknown item '" + entry.ItemId + "'; it is skipped.");
                    continue;
                }

                int count = Math.Max(1, entry.Count);
                if (entry.Slot != EquipmentSlot.None && !EquipmentSlotIds.IsQuickSlot(entry.Slot) && Equipment.Fits(spec.EquipKind, entry.Slot))
                {
                    // One piece goes into the slot, further pieces into the bag (a slot never holds a stack).
                    _equipment.Set(entry.Slot, _generator.CreateFixed(spec, entry.ItemLevel, entry.Rarity, 1, _ids, ItemFlags.None));
                    if (count > 1)
                    {
                        AddLoaded(_generator.CreateFixed(spec, entry.ItemLevel, entry.Rarity, count - 1, _ids, ItemFlags.None));
                    }

                    continue;
                }

                if (!PlayerContainer.TryAdd(_generator.CreateFixed(spec, entry.ItemLevel, entry.Rarity, count, _ids, ItemFlags.None)))
                {
                    Log.Warning(LogCategory.Data, "Starting equipment: '" + entry.ItemId + "' does not fit into the bag (1000 entries) and is skipped.");
                }

                if (EquipmentSlotIds.IsQuickSlot(entry.Slot) && spec.EquipKind == EquipKind.QuickUse)
                {
                    _equipment.SetQuickSlot(entry.Slot, spec.Id);
                }
            }

            FreeLockedOffHand();
            PlayerWallet.Set(CurrencyIds.Gold, _kit.Gold);
            Rebind();
        }

        /// <summary>
        /// Replaces the player's state with loaded data (no global events): bag, equipped items, quick slot ids and currencies.
        /// Stat modifiers are rebuilt from the loaded equipment. Repairs instead of losing pieces: counts above the stack size
        /// are split into further entries, an equipped stack keeps one piece in the slot and puts the rest into the bag, and an
        /// off-hand item next to a two-handed weapon goes into the bag; entries beyond the limit of 1000 are logged.
        /// </summary>
        /// <param name="bag">Bag entries.</param>
        /// <param name="equipped">Equipped instances by slot.</param>
        /// <param name="quickSlots">Quick slot item ids by slot.</param>
        /// <param name="currencies">Currency amounts by id.</param>
        public void LoadState(IEnumerable<ItemInstance> bag, IEnumerable<KeyValuePair<EquipmentSlot, ItemInstance>> equipped,
            IEnumerable<KeyValuePair<EquipmentSlot, string>> quickSlots, IEnumerable<KeyValuePair<string, int>> currencies)
        {
            ClearPlayer();
            if (bag != null)
            {
                foreach (ItemInstance item in bag)
                {
                    AddLoaded(item);
                }
            }

            if (equipped != null)
            {
                foreach (KeyValuePair<EquipmentSlot, ItemInstance> pair in equipped)
                {
                    ItemInstance item = pair.Value;
                    if (item == null)
                    {
                        continue;
                    }

                    if (item.Count > 1)
                    {
                        Log.Warning(LogCategory.Save, "Inventory: slot " + pair.Key + " held " + item.Count + " x '" + item.ItemId + "'; one stays equipped, the rest goes into the bag.");
                        AddLoaded(item.CloneAs(ItemInstanceIds.Create(_ids), item.Count - 1));
                        item.SetCount(1);
                    }

                    _equipment.Set(pair.Key, item);
                }
            }

            FreeLockedOffHand();

            if (quickSlots != null)
            {
                foreach (KeyValuePair<EquipmentSlot, string> pair in quickSlots)
                {
                    _equipment.SetQuickSlot(pair.Key, pair.Value);
                }
            }

            if (currencies != null)
            {
                foreach (KeyValuePair<string, int> pair in currencies)
                {
                    PlayerWallet.Set(pair.Key, pair.Value);
                }
            }

            Rebind();
        }

        private void AddLoaded(ItemInstance item)
        {
            if (item != null && !PlayerContainer.AddRaw(item))
            {
                Log.Warning(LogCategory.Save, "Inventory: '" + item.ItemId + "' x" + item.Count + " could not be loaded into the bag (1000 entries or duplicate id) and is dropped.");
            }
        }

        private void FreeLockedOffHand()
        {
            // Content may change between saves (a weapon became two-handed): the locked off hand must not stay occupied.
            if (_equipment.Get(EquipmentSlot.OffHand) == null || !_equipment.IsOffHandLocked())
            {
                return;
            }

            ItemInstance offHand = _equipment.Set(EquipmentSlot.OffHand, null);
            Log.Warning(LogCategory.Save, "Inventory: '" + offHand.ItemId + "' cannot stay in the off hand next to a two-handed weapon and goes into the bag.");
            AddLoaded(offHand);
        }

        private void ClearPlayer()
        {
            if (_binding.Stats != null)
            {
                _binding.Rebuild(null, EncumbranceLevel.Normal);
            }

            PlayerContainer.Clear();
            _equipment.Clear();
            PlayerWallet.Clear();
        }

        private void Rebind()
        {
            RefreshEncumbrance(false);
            _binding.Rebuild(_equipment, _encumbrance.Level);
            RefreshEncumbrance(true);
            Notify();
        }

        private void MoveToBag(EquipmentSlot slot)
        {
            ItemInstance item = _equipment.Set(slot, null);
            if (item == null)
            {
                return;
            }

            _binding.RemoveItem(item);
            PlayerContainer.AddRaw(item);
            PublishEquipped(slot, null);
        }

        private void PublishEquipped(EquipmentSlot slot, ItemInstance item)
        {
            var equipped = new ItemEquipped(EquipmentSlotIds.ToId(slot), item != null ? item.InstanceId : string.Empty,
                item != null ? item.ItemId : string.Empty);
            _eventBus.Publish(in equipped);
        }

        private void AfterChange()
        {
            RefreshEncumbrance(true);
            Notify();
        }

        private void RefreshEncumbrance(bool apply)
        {
            StatCollection stats = _binding.Stats;
            float capacity = stats != null ? stats.Get(StatId.CarryCapacity) : StatFormulas.CarryCapacity(StatFormulas.PrologueAttributeValue);
            EncumbranceLevel before = _encumbrance.Level;
            _encumbrance = new EncumbranceState(PlayerContainer.TotalWeight + _equipment.TotalWeight, capacity);
            if (apply && _encumbrance.Level != before)
            {
                _binding.ApplyEncumbrance(_encumbrance.Level);
                Log.Info(LogCategory.Player, "Load " + _encumbrance.Load.ToString("0.0") + "/" + capacity.ToString("0.0") + " kg: " + _encumbrance.Level + ".");
            }
        }

        private void OnStatChanged(StatId stat, float oldValue, float newValue)
        {
            if (stat == StatId.CarryCapacity)
            {
                RefreshEncumbrance(true);
                Notify();
            }
        }

        private void Notify()
        {
            Revision++;
            Action handler = Changed;
            if (handler != null)
            {
                handler();
            }
        }

        private CurrencyWallet GetWallet(string ownerId)
        {
            string key = ownerId ?? string.Empty;
            if (!_wallets.TryGetValue(key, out CurrencyWallet wallet))
            {
                wallet = new CurrencyWallet();
                _wallets.Add(key, wallet);
            }

            return wallet;
        }

        private static bool IsPlayer(string ownerId)
        {
            return string.Equals(ownerId, InventoryOwners.Player, StringComparison.Ordinal);
        }
    }
}
