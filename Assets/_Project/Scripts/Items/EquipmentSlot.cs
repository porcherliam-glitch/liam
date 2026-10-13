namespace Aetherfall.Items
{
    /// <summary>
    /// Equipment slots exactly as §12.2 (GDD 04 2.1, architecture 11.6): head, chest, hands, legs, feet, cloak, main hand,
    /// off hand, ranged, 2 rings, amulet and 4 quick slots. Transmog is a separate field later. Values are stored in assets:
    /// never renumber; saves and events use the ids of <see cref="EquipmentSlotIds"/>.
    /// </summary>
    public enum EquipmentSlot
    {
        /// <summary>No slot.</summary>
        None = 0,

        /// <summary>Head (German "Kopf").</summary>
        Head = 1,

        /// <summary>Chest (German "Brust").</summary>
        Chest = 2,

        /// <summary>Hands (German "Haende").</summary>
        Hands = 3,

        /// <summary>Legs (German "Beine").</summary>
        Legs = 4,

        /// <summary>Feet (German "Fuesse").</summary>
        Feet = 5,

        /// <summary>Cloak (German "Umhang"), classless.</summary>
        Cloak = 6,

        /// <summary>Main hand (German "Haupthand"): one-handed, two-handed or paired weapon.</summary>
        MainHand = 7,

        /// <summary>Off hand (German "Nebenhand"): shield or spellbook, only with a one-handed weapon.</summary>
        OffHand = 8,

        /// <summary>Ranged (German "Fernkampf"): bow or crossbow.</summary>
        Ranged = 9,

        /// <summary>First ring.</summary>
        Ring1 = 10,

        /// <summary>Second ring.</summary>
        Ring2 = 11,

        /// <summary>Amulet (German "Amulett").</summary>
        Amulet = 12,

        /// <summary>Quick slot 1 (D-pad up, key 5): consumables, tools.</summary>
        QuickSlot1 = 13,

        /// <summary>Quick slot 2 (D-pad right, key 6).</summary>
        QuickSlot2 = 14,

        /// <summary>Quick slot 3 (D-pad down, key 7).</summary>
        QuickSlot3 = 15,

        /// <summary>Quick slot 4 (D-pad left, key 8).</summary>
        QuickSlot4 = 16
    }
}
