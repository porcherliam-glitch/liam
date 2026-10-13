using System;
using System.Collections.Generic;
using Aetherfall.Items;
using Aetherfall.Utilities;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// A container of item instances (architecture 11.6 "InventoryContainer": player, storage chest, merchants, chest
    /// contents): no slot limit, only weight (GDD 04 1.2), stacking up to the stack size of the item, a technical limit of
    /// 1,000 entries, weight sum and counts. Pure C#; events are sent by <see cref="InventoryService"/>.
    /// </summary>
    /// <remarks>
    /// Stackables merge into existing stacks of the same item (stolen and clean stacks stay apart); what does not fit opens
    /// new stacks with new instance ids from the id random source. Single items (equipment, stack size 1) always have one
    /// entry per piece: an instance with a count above 1 is split into pieces with own ids.
    /// </remarks>
    public sealed class InventoryContainer
    {
        /// <summary>Technical limit of entries (GDD 04 1.2: 1,000).</summary>
        public const int MaxEntries = 1000;

        /// <summary>From this many entries a warning is due (GDD 04 1.2: 900).</summary>
        public const int WarnEntries = 900;

        private readonly List<ItemInstance> _entries = new List<ItemInstance>();
        private readonly IItemCatalog _catalog;
        private readonly IRandom _ids;

        /// <summary>Creates an empty container.</summary>
        /// <param name="ownerId">Owner id (<see cref="InventoryOwners"/>).</param>
        /// <param name="catalog">Item data (stack sizes, weights).</param>
        /// <param name="ids">Random source for the ids of new stacks.</param>
        public InventoryContainer(string ownerId, IItemCatalog catalog, IRandom ids)
        {
            OwnerId = ownerId ?? string.Empty;
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _ids = ids ?? throw new ArgumentNullException(nameof(ids));
        }

        /// <summary>Owner id.</summary>
        public string OwnerId { get; }

        /// <summary>Entries left before the technical limit of <see cref="MaxEntries"/>.</summary>
        public int FreeEntries => MaxEntries - _entries.Count;

        /// <summary>Entries in insertion order.</summary>
        public IReadOnlyList<ItemInstance> Entries => _entries;

        /// <summary>Total weight of all entries in kg (quest items weigh 0).</summary>
        public float TotalWeight
        {
            get
            {
                float total = 0f;
                for (int i = 0; i < _entries.Count; i++)
                {
                    total += WeightOf(_entries[i]);
                }

                return total;
            }
        }

        /// <summary>Weight of one entry (piece weight × count).</summary>
        /// <param name="instance">Entry.</param>
        public float WeightOf(ItemInstance instance)
        {
            return instance != null && _catalog.TryGetItem(instance.ItemId, out ItemSpec spec) ? spec.Weight * instance.Count : 0f;
        }

        /// <summary>Number of pieces of an item in this container.</summary>
        /// <param name="itemId">Item id.</param>
        public int CountOf(string itemId)
        {
            int count = 0;
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].ItemId == itemId)
                {
                    count += _entries[i].Count;
                }
            }

            return count;
        }

        /// <summary>Finds an entry by instance id.</summary>
        /// <param name="instanceId">Instance id.</param>
        /// <returns>The entry or null.</returns>
        public ItemInstance Find(string instanceId)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].InstanceId == instanceId)
                {
                    return _entries[i];
                }
            }

            return null;
        }

        /// <summary>
        /// Number of new entries <see cref="TryAdd"/> would open for an instance: single items one per piece, stackables the
        /// stacks for what does not fit into existing stacks of the same item.
        /// </summary>
        /// <param name="instance">Instance to add.</param>
        /// <param name="ignoreExistingStacks">
        /// True = as if no existing stack had room; an upper bound when several instances are added one after another.
        /// </param>
        /// <returns>The number of new entries, or −1 for null or an unknown item.</returns>
        public int EntriesNeeded(ItemInstance instance, bool ignoreExistingStacks = false)
        {
            if (instance == null || !_catalog.TryGetItem(instance.ItemId, out ItemSpec spec))
            {
                return -1;
            }

            if (!spec.IsStackable)
            {
                return instance.Count;
            }

            int stackSize = spec.StackSize;
            int free = 0;
            for (int i = 0; i < _entries.Count && !ignoreExistingStacks; i++)
            {
                if (CanMerge(_entries[i], instance))
                {
                    free += Math.Max(0, stackSize - _entries[i].Count);
                }
            }

            int overflow = Math.Max(0, instance.Count - free);
            return (overflow + stackSize - 1) / stackSize;
        }

        /// <summary>True if <see cref="TryAdd"/> would accept the instance now (known item, new instance id, entry limit).</summary>
        /// <param name="instance">Instance to add.</param>
        public bool CanAdd(ItemInstance instance)
        {
            if (instance == null || Find(instance.InstanceId) != null)
            {
                return false;
            }

            int needed = EntriesNeeded(instance);
            return needed >= 0 && needed <= FreeEntries;
        }

        /// <summary>
        /// Adds an instance. Stackables fill existing stacks first (up to the stack size), the rest opens new stacks; single
        /// items with a count above 1 become one entry per piece. Fails without change for unknown items, a duplicate instance
        /// id or if the entry limit would be exceeded.
        /// </summary>
        /// <param name="instance">Instance to add (the container takes ownership; it may be merged away or split).</param>
        /// <returns>True if added.</returns>
        public bool TryAdd(ItemInstance instance)
        {
            if (!CanAdd(instance))
            {
                return false;
            }

            _catalog.TryGetItem(instance.ItemId, out ItemSpec spec);
            if (!spec.IsStackable)
            {
                AddSplit(instance, 1);
                return true;
            }

            int stackSize = spec.StackSize;
            int remaining = instance.Count;
            for (int i = 0; i < _entries.Count && remaining > 0; i++)
            {
                ItemInstance stack = _entries[i];
                if (!CanMerge(stack, instance) || stack.Count >= stackSize)
                {
                    continue;
                }

                int moved = Math.Min(stackSize - stack.Count, remaining);
                stack.SetCount(stack.Count + moved);
                if (instance.IsNew)
                {
                    stack.SetFlags(ItemFlags.New, true);
                }

                remaining -= moved;
            }

            if (remaining > 0)
            {
                instance.SetCount(remaining);
                AddSplit(instance, stackSize);
            }

            return true;
        }

        /// <summary>
        /// Adds an instance without merging (loading a save, equipment going back into the bag). A count above the stack size
        /// of the item (single items: above 1, e.g. an older save or a reduced stack size) is split into further entries with
        /// new ids instead of being cut. Fails without change for a duplicate instance id or if the entry limit would be exceeded.
        /// </summary>
        /// <param name="instance">Instance.</param>
        /// <returns>True if added.</returns>
        public bool AddRaw(ItemInstance instance)
        {
            if (instance == null || Find(instance.InstanceId) != null)
            {
                return false;
            }

            int perEntry = _catalog.TryGetItem(instance.ItemId, out ItemSpec spec) ? Math.Max(1, spec.StackSize) : int.MaxValue;
            int needed = instance.Count <= perEntry ? 1 : (instance.Count - 1) / perEntry + 1;
            if (needed > FreeEntries)
            {
                return false;
            }

            AddSplit(instance, perEntry);
            return true;
        }

        /// <summary>Removes a whole entry.</summary>
        /// <param name="instanceId">Instance id.</param>
        /// <returns>The removed entry, or null.</returns>
        public ItemInstance RemoveInstance(string instanceId)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].InstanceId == instanceId)
                {
                    ItemInstance removed = _entries[i];
                    _entries.RemoveAt(i);
                    return removed;
                }
            }

            return null;
        }

        /// <summary>
        /// Takes pieces off an entry: the whole entry if <paramref name="count"/> covers it, otherwise a split copy with a new id.
        /// </summary>
        /// <param name="instanceId">Instance id.</param>
        /// <param name="count">Pieces to take (at least 1).</param>
        /// <returns>The taken instance, or null if the entry does not exist.</returns>
        public ItemInstance Take(string instanceId, int count)
        {
            ItemInstance entry = Find(instanceId);
            if (entry == null || count < 1)
            {
                return null;
            }

            if (count >= entry.Count)
            {
                return RemoveInstance(instanceId);
            }

            entry.SetCount(entry.Count - count);
            return entry.CloneAs(ItemInstanceIds.Create(_ids), count);
        }

        /// <summary>Removes pieces of an item (smallest stacks first), e.g. quest hand-ins and crafting.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Pieces to remove.</param>
        /// <returns>Pieces removed (less than <paramref name="amount"/> if there are not enough).</returns>
        public int RemoveItem(string itemId, int amount)
        {
            int removed = 0;
            while (removed < amount)
            {
                int index = -1;
                for (int i = 0; i < _entries.Count; i++)
                {
                    if (_entries[i].ItemId == itemId && (index < 0 || _entries[i].Count < _entries[index].Count))
                    {
                        index = i;
                    }
                }

                if (index < 0)
                {
                    break;
                }

                ItemInstance stack = _entries[index];
                int take = Math.Min(stack.Count, amount - removed);
                if (take >= stack.Count)
                {
                    _entries.RemoveAt(index);
                }
                else
                {
                    stack.SetCount(stack.Count - take);
                }

                removed += take;
            }

            return removed;
        }

        /// <summary>Removes all entries.</summary>
        public void Clear()
        {
            _entries.Clear();
        }

        private void AddSplit(ItemInstance instance, int perEntry)
        {
            // The instance itself keeps its id and takes the first part; every further part is a copy with a new id.
            int remaining = instance.Count;
            int first = Math.Min(perEntry, remaining);
            if (first != instance.Count)
            {
                instance.SetCount(first);
            }

            _entries.Add(instance);
            remaining -= first;
            while (remaining > 0)
            {
                int part = Math.Min(perEntry, remaining);
                _entries.Add(instance.CloneAs(ItemInstanceIds.Create(_ids), part));
                remaining -= part;
            }
        }

        private static bool CanMerge(ItemInstance stack, ItemInstance incoming)
        {
            return stack.ItemId == incoming.ItemId && stack.IsStolen == incoming.IsStolen;
        }
    }
}
