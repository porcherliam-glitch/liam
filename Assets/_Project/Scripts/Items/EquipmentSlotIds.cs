namespace Aetherfall.Items
{
    /// <summary>
    /// Stable string ids and German names of <see cref="EquipmentSlot"/> (saves, event <c>ItemEquipped.Slot</c>). Never change
    /// an id. Also the slot groups used by the rules (armor class slots, quick slots).
    /// </summary>
    public static class EquipmentSlotIds
    {
        /// <summary>All 16 slots in display order (head … quick slot 4).</summary>
        public static readonly EquipmentSlot[] All =
        {
            EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Hands, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Cloak,
            EquipmentSlot.MainHand, EquipmentSlot.OffHand, EquipmentSlot.Ranged, EquipmentSlot.Ring1, EquipmentSlot.Ring2, EquipmentSlot.Amulet,
            EquipmentSlot.QuickSlot1, EquipmentSlot.QuickSlot2, EquipmentSlot.QuickSlot3, EquipmentSlot.QuickSlot4
        };

        /// <summary>Stable id of a slot (empty for <see cref="EquipmentSlot.None"/>).</summary>
        /// <param name="slot">Slot.</param>
        public static string ToId(EquipmentSlot slot)
        {
            switch (slot)
            {
                case EquipmentSlot.Head: return "kopf";
                case EquipmentSlot.Chest: return "brust";
                case EquipmentSlot.Hands: return "haende";
                case EquipmentSlot.Legs: return "beine";
                case EquipmentSlot.Feet: return "fuesse";
                case EquipmentSlot.Cloak: return "umhang";
                case EquipmentSlot.MainHand: return "haupthand";
                case EquipmentSlot.OffHand: return "nebenhand";
                case EquipmentSlot.Ranged: return "fernkampf";
                case EquipmentSlot.Ring1: return "ring_1";
                case EquipmentSlot.Ring2: return "ring_2";
                case EquipmentSlot.Amulet: return "amulett";
                case EquipmentSlot.QuickSlot1: return "schnellslot_1";
                case EquipmentSlot.QuickSlot2: return "schnellslot_2";
                case EquipmentSlot.QuickSlot3: return "schnellslot_3";
                case EquipmentSlot.QuickSlot4: return "schnellslot_4";
                default: return string.Empty;
            }
        }

        /// <summary>Parses a slot id.</summary>
        /// <param name="id">Slot id.</param>
        /// <param name="slot">Slot or <see cref="EquipmentSlot.None"/>.</param>
        /// <returns>True if the id is known.</returns>
        public static bool TryParse(string id, out EquipmentSlot slot)
        {
            for (int i = 0; i < All.Length; i++)
            {
                if (ToId(All[i]) == id)
                {
                    slot = All[i];
                    return true;
                }
            }

            slot = EquipmentSlot.None;
            return false;
        }

        /// <summary>German slot name for debug views. TODO (localization step): string table key.</summary>
        /// <param name="slot">Slot.</param>
        public static string GermanName(EquipmentSlot slot)
        {
            switch (slot)
            {
                case EquipmentSlot.Head: return "Kopf";
                case EquipmentSlot.Chest: return "Brust";
                case EquipmentSlot.Hands: return "Hände";
                case EquipmentSlot.Legs: return "Beine";
                case EquipmentSlot.Feet: return "Füße";
                case EquipmentSlot.Cloak: return "Umhang";
                case EquipmentSlot.MainHand: return "Haupthand";
                case EquipmentSlot.OffHand: return "Nebenhand";
                case EquipmentSlot.Ranged: return "Fernkampf";
                case EquipmentSlot.Ring1: return "Ring 1";
                case EquipmentSlot.Ring2: return "Ring 2";
                case EquipmentSlot.Amulet: return "Amulett";
                case EquipmentSlot.QuickSlot1: return "Schnellslot 1";
                case EquipmentSlot.QuickSlot2: return "Schnellslot 2";
                case EquipmentSlot.QuickSlot3: return "Schnellslot 3";
                case EquipmentSlot.QuickSlot4: return "Schnellslot 4";
                default: return "–";
            }
        }

        /// <summary>True for the four quick slots (they reference an item id, not an instance, GDD 04 2.3).</summary>
        /// <param name="slot">Slot.</param>
        public static bool IsQuickSlot(EquipmentSlot slot)
        {
            return slot >= EquipmentSlot.QuickSlot1 && slot <= EquipmentSlot.QuickSlot4;
        }

        /// <summary>True for the five slots that decide the armor class (head to feet, GDD 04 2.1).</summary>
        /// <param name="slot">Slot.</param>
        public static bool CountsForArmorClass(EquipmentSlot slot)
        {
            return slot >= EquipmentSlot.Head && slot <= EquipmentSlot.Feet;
        }
    }
}
