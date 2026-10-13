using System;
using System.Collections.Generic;

namespace Aetherfall.Items
{
    /// <summary>
    /// Run-time state of one item or one stack (architecture 5.1 "ItemInstance"): instance id (16 hex digits), item id,
    /// item level, rarity, base roll (spread 0.95–1.05), count, affix rolls and the markers new, favourite, locked, stolen.
    /// References its definition only by id; saved by the inventory as DTO.
    /// </summary>
    /// <remarks>
    /// Stackable items (materials, potions) use one instance per stack with <see cref="Count"/> &gt; 1 and no affixes; this
    /// folds the <c>ItemStack</c> of architecture 5.1 into this type until quality and stolen stacks need their own type.
    /// TODO (later steps): sockets, quality, transmog item id, enchant state.
    /// </remarks>
    public sealed class ItemInstance
    {
        private readonly List<AffixRoll> _affixes;

        /// <summary>Creates an instance.</summary>
        /// <param name="instanceId">Instance id (16 hex digits, <see cref="ItemInstanceIds"/>).</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="itemLevel">Item level (at least 1).</param>
        /// <param name="rarity">Rarity.</param>
        /// <param name="baseRoll">Spread of the base value (1 = none).</param>
        /// <param name="count">Count (at least 1).</param>
        /// <param name="flags">Markers.</param>
        /// <param name="affixes">Affix rolls (copied); null = none.</param>
        public ItemInstance(string instanceId, string itemId, int itemLevel, ItemRarity rarity, float baseRoll, int count, ItemFlags flags,
            IEnumerable<AffixRoll> affixes)
        {
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new ArgumentException("An instance id is required.", nameof(instanceId));
            }

            if (string.IsNullOrEmpty(itemId))
            {
                throw new ArgumentException("An item id is required.", nameof(itemId));
            }

            InstanceId = instanceId;
            ItemId = itemId;
            ItemLevel = Math.Max(1, itemLevel);
            Rarity = rarity;
            BaseRoll = baseRoll > 0f ? baseRoll : 1f;
            Count = Math.Max(1, count);
            Flags = flags;
            _affixes = affixes != null ? new List<AffixRoll>(affixes) : new List<AffixRoll>();
        }

        /// <summary>Instance id (16 hex digits).</summary>
        public string InstanceId { get; }

        /// <summary>Item id of the definition.</summary>
        public string ItemId { get; }

        /// <summary>Item level 1–80.</summary>
        public int ItemLevel { get; }

        /// <summary>Rarity.</summary>
        public ItemRarity Rarity { get; }

        /// <summary>Spread of the base value 0.95–1.05 (GDD 04 4.2, saved as <c>baseRoll</c>).</summary>
        public float BaseRoll { get; }

        /// <summary>Number of pieces in this stack (1 for single items).</summary>
        public int Count { get; private set; }

        /// <summary>Markers (new, favourite, locked, stolen).</summary>
        public ItemFlags Flags { get; private set; }

        /// <summary>Rolled affixes in roll order.</summary>
        public IReadOnlyList<AffixRoll> Affixes => _affixes;

        /// <summary>True while marked as new.</summary>
        public bool IsNew => (Flags & ItemFlags.New) != 0;

        /// <summary>True if marked as favourite.</summary>
        public bool IsFavorite => (Flags & ItemFlags.Favorite) != 0;

        /// <summary>True if locked (not sellable, not droppable).</summary>
        public bool IsLocked => (Flags & ItemFlags.Locked) != 0;

        /// <summary>True if stolen.</summary>
        public bool IsStolen => (Flags & ItemFlags.Stolen) != 0;

        /// <summary>Sets the count of the stack.</summary>
        /// <param name="count">New count (at least 1; remove the instance instead of setting 0).</param>
        public void SetCount(int count)
        {
            if (count < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(count), "A stack has at least one piece; remove the instance instead.");
            }

            Count = count;
        }

        /// <summary>Sets or clears markers.</summary>
        /// <param name="flags">Markers to change.</param>
        /// <param name="enabled">True to set, false to clear.</param>
        public void SetFlags(ItemFlags flags, bool enabled)
        {
            Flags = enabled ? Flags | flags : Flags & ~flags;
        }

        /// <summary>Copy with another instance id and count (splitting a stack, dropping part of it).</summary>
        /// <param name="instanceId">Id of the copy.</param>
        /// <param name="count">Count of the copy.</param>
        public ItemInstance CloneAs(string instanceId, int count)
        {
            return new ItemInstance(instanceId, ItemId, ItemLevel, Rarity, BaseRoll, count, Flags, _affixes);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return ItemId + " #" + InstanceId + " (iLvl " + ItemLevel + ", " + ItemRarityIds.ToId(Rarity) + ", x" + Count + ")";
        }
    }
}
