using System;
using System.Collections.Generic;
using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// The equipment slots of the player (§12.2, GDD 04 2.1, architecture 11.6): head, chest, hands, legs, feet, cloak, main
    /// hand, off hand, ranged, 2 rings, amulet with item instances, and 4 quick slots that reference an item id (GDD 04 2.3).
    /// Pure state with the slot rules; <see cref="InventoryService"/> moves items between bag and slots and applies the stats.
    /// </summary>
    /// <remarks>
    /// Rules: an item fits only its slot kind (rings either ring slot); the off hand takes a shield or spellbook only next to
    /// a one-handed weapon or an empty main hand; a two-handed or paired weapon locks the off hand; the player level must be at
    /// least item level − 3 (GDD 04 2.4); no class or attribute locks. TODO: second weapon set (stage B), transmog.
    /// </remarks>
    public sealed class Equipment
    {
        private readonly ItemInstance[] _slots = new ItemInstance[(int)EquipmentSlot.QuickSlot4 + 1];
        private readonly string[] _quickSlots = new string[(int)EquipmentSlot.QuickSlot4 + 1];
        private readonly IItemCatalog _catalog;

        /// <summary>Creates empty equipment.</summary>
        /// <param name="catalog">Item data.</param>
        public Equipment(IItemCatalog catalog)
        {
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        }

        /// <summary>Instance in a slot (null if empty or a quick slot).</summary>
        /// <param name="slot">Slot.</param>
        public ItemInstance Get(EquipmentSlot slot)
        {
            int index = (int)slot;
            return index > 0 && index < _slots.Length && !EquipmentSlotIds.IsQuickSlot(slot) ? _slots[index] : null;
        }

        /// <summary>Item id in a quick slot (empty if none).</summary>
        /// <param name="slot">Quick slot.</param>
        public string GetQuickSlot(EquipmentSlot slot)
        {
            return EquipmentSlotIds.IsQuickSlot(slot) ? _quickSlots[(int)slot] ?? string.Empty : string.Empty;
        }

        /// <summary>Finds the slot of an equipped instance.</summary>
        /// <param name="instanceId">Instance id.</param>
        /// <returns>The slot or <see cref="EquipmentSlot.None"/>.</returns>
        public EquipmentSlot SlotOf(string instanceId)
        {
            for (int i = 1; i < _slots.Length; i++)
            {
                if (_slots[i] != null && _slots[i].InstanceId == instanceId)
                {
                    return (EquipmentSlot)i;
                }
            }

            return EquipmentSlot.None;
        }

        /// <summary>Total weight of the equipped items in kg (equipped items count fully, GDD 04 1.3).</summary>
        public float TotalWeight
        {
            get
            {
                float total = 0f;
                for (int i = 1; i < _slots.Length; i++)
                {
                    if (_slots[i] != null && _catalog.TryGetItem(_slots[i].ItemId, out ItemSpec spec))
                    {
                        total += spec.Weight * _slots[i].Count;
                    }
                }

                return total;
            }
        }

        /// <summary>Number of equipped pieces of an item.</summary>
        /// <param name="itemId">Item id.</param>
        public int CountOf(string itemId)
        {
            int count = 0;
            for (int i = 1; i < _slots.Length; i++)
            {
                if (_slots[i] != null && _slots[i].ItemId == itemId)
                {
                    count += _slots[i].Count;
                }
            }

            return count;
        }

        /// <summary>Armor class of the character from head to feet (GDD 04 2.1, see <see cref="ArmorRules.Resolve"/>).</summary>
        public ArmorClass ArmorClass =>
            ArmorRules.Resolve(ClassIn(EquipmentSlot.Head), ClassIn(EquipmentSlot.Chest), ClassIn(EquipmentSlot.Hands), ClassIn(EquipmentSlot.Legs),
                ClassIn(EquipmentSlot.Feet));

        /// <summary>Appends all equipped instances with their slots.</summary>
        /// <param name="result">Receives (slot, instance) pairs.</param>
        public void CollectEquipped(List<KeyValuePair<EquipmentSlot, ItemInstance>> result)
        {
            for (int i = 1; i < _slots.Length; i++)
            {
                if (_slots[i] != null)
                {
                    result.Add(new KeyValuePair<EquipmentSlot, ItemInstance>((EquipmentSlot)i, _slots[i]));
                }
            }
        }

        /// <summary>The slot an item goes to when no slot is chosen: its kind's slot; rings the first free ring slot (else ring 1).</summary>
        /// <param name="spec">Item data.</param>
        public EquipmentSlot SuggestSlot(ItemSpec spec)
        {
            if (spec == null)
            {
                return EquipmentSlot.None;
            }

            switch (spec.EquipKind)
            {
                case EquipKind.Head: return EquipmentSlot.Head;
                case EquipKind.Chest: return EquipmentSlot.Chest;
                case EquipKind.Hands: return EquipmentSlot.Hands;
                case EquipKind.Legs: return EquipmentSlot.Legs;
                case EquipKind.Feet: return EquipmentSlot.Feet;
                case EquipKind.Cloak: return EquipmentSlot.Cloak;
                case EquipKind.OneHanded:
                case EquipKind.TwoHanded:
                    return EquipmentSlot.MainHand;
                case EquipKind.OffHand: return EquipmentSlot.OffHand;
                case EquipKind.Ranged: return EquipmentSlot.Ranged;
                case EquipKind.Amulet: return EquipmentSlot.Amulet;
                case EquipKind.Ring:
                    if (_slots[(int)EquipmentSlot.Ring1] == null)
                    {
                        return EquipmentSlot.Ring1;
                    }

                    return _slots[(int)EquipmentSlot.Ring2] == null ? EquipmentSlot.Ring2 : EquipmentSlot.Ring1;
                case EquipKind.QuickUse:
                    for (EquipmentSlot quick = EquipmentSlot.QuickSlot1; quick <= EquipmentSlot.QuickSlot4; quick++)
                    {
                        if (string.IsNullOrEmpty(_quickSlots[(int)quick]))
                        {
                            return quick;
                        }
                    }

                    return EquipmentSlot.QuickSlot1;
                default:
                    return EquipmentSlot.None;
            }
        }

        /// <summary>
        /// Checks whether an item may go into a slot (kind, off hand lock, level requirement). Equipping a two-handed weapon
        /// next to a shield is allowed: the caller moves the off hand item back into the bag.
        /// </summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance (item level); null for quick slot checks.</param>
        /// <param name="slot">Target slot.</param>
        /// <param name="playerLevel">Level of the player.</param>
        /// <param name="reason">German reason if not allowed, otherwise empty.</param>
        public bool CanEquip(ItemSpec spec, ItemInstance instance, EquipmentSlot slot, int playerLevel, out string reason)
        {
            reason = string.Empty;
            if (spec == null)
            {
                reason = "Unbekannter Gegenstand.";
                return false;
            }

            if (EquipmentSlotIds.IsQuickSlot(slot))
            {
                if (spec.EquipKind != EquipKind.QuickUse)
                {
                    reason = "Nur Verbrauchsgüter und Werkzeuge passen in Schnellslots.";
                    return false;
                }

                return true;
            }

            if (!Fits(spec.EquipKind, slot))
            {
                reason = "Passt nicht in den Platz „" + EquipmentSlotIds.GermanName(slot) + "“.";
                return false;
            }

            if (slot == EquipmentSlot.OffHand && IsOffHandLocked())
            {
                reason = "Nebenhand gesperrt: In der Haupthand liegt eine Zweihand- oder Paarwaffe.";
                return false;
            }

            if (instance != null && playerLevel < ItemFormulas.RequiredPlayerLevel(instance.ItemLevel))
            {
                reason = "Ab Level " + ItemFormulas.RequiredPlayerLevel(instance.ItemLevel) + ".";
                return false;
            }

            return true;
        }

        /// <summary>True if the main hand holds a two-handed or paired weapon.</summary>
        public bool IsOffHandLocked()
        {
            ItemInstance main = _slots[(int)EquipmentSlot.MainHand];
            return main != null && _catalog.TryGetItem(main.ItemId, out ItemSpec spec) && spec.EquipKind == EquipKind.TwoHanded;
        }

        /// <summary>Puts an instance into a slot without checks (loading, start kit) and returns the previous one.</summary>
        /// <param name="slot">Slot (not a quick slot).</param>
        /// <param name="instance">Instance or null to empty the slot.</param>
        /// <returns>The instance that was in the slot, or null.</returns>
        public ItemInstance Set(EquipmentSlot slot, ItemInstance instance)
        {
            int index = (int)slot;
            if (index <= 0 || index >= _slots.Length || EquipmentSlotIds.IsQuickSlot(slot))
            {
                throw new ArgumentOutOfRangeException(nameof(slot), slot, "Not an equipment slot.");
            }

            ItemInstance previous = _slots[index];
            _slots[index] = instance;
            return previous;
        }

        /// <summary>Sets the item id of a quick slot (empty clears it).</summary>
        /// <param name="slot">Quick slot.</param>
        /// <param name="itemId">Item id or empty.</param>
        public void SetQuickSlot(EquipmentSlot slot, string itemId)
        {
            if (!EquipmentSlotIds.IsQuickSlot(slot))
            {
                throw new ArgumentOutOfRangeException(nameof(slot), slot, "Not a quick slot.");
            }

            _quickSlots[(int)slot] = itemId ?? string.Empty;
        }

        /// <summary>Empties all slots and quick slots.</summary>
        public void Clear()
        {
            Array.Clear(_slots, 0, _slots.Length);
            Array.Clear(_quickSlots, 0, _quickSlots.Length);
        }

        /// <summary>True if an item of <paramref name="kind"/> fits <paramref name="slot"/>.</summary>
        /// <param name="kind">Slot kind of the item.</param>
        /// <param name="slot">Slot.</param>
        public static bool Fits(EquipKind kind, EquipmentSlot slot)
        {
            switch (slot)
            {
                case EquipmentSlot.Head: return kind == EquipKind.Head;
                case EquipmentSlot.Chest: return kind == EquipKind.Chest;
                case EquipmentSlot.Hands: return kind == EquipKind.Hands;
                case EquipmentSlot.Legs: return kind == EquipKind.Legs;
                case EquipmentSlot.Feet: return kind == EquipKind.Feet;
                case EquipmentSlot.Cloak: return kind == EquipKind.Cloak;
                case EquipmentSlot.MainHand: return kind == EquipKind.OneHanded || kind == EquipKind.TwoHanded;
                case EquipmentSlot.OffHand: return kind == EquipKind.OffHand;
                case EquipmentSlot.Ranged: return kind == EquipKind.Ranged;
                case EquipmentSlot.Ring1:
                case EquipmentSlot.Ring2:
                    return kind == EquipKind.Ring;
                case EquipmentSlot.Amulet: return kind == EquipKind.Amulet;
                default: return false;
            }
        }

        private ArmorClass ClassIn(EquipmentSlot slot)
        {
            ItemInstance item = _slots[(int)slot];
            return item != null && _catalog.TryGetItem(item.ItemId, out ItemSpec spec) ? spec.ArmorClass : ArmorClass.None;
        }
    }
}
