namespace Aetherfall.Items
{
    /// <summary>
    /// Which equipment slot(s) an item fits (GDD 04 2.1). Two-handed includes paired weapons (daggers, fist weapons): both
    /// lock the off hand. Values are stored in assets: never renumber.
    /// </summary>
    public enum EquipKind
    {
        /// <summary>Not equippable (materials, quest items, books, misc).</summary>
        None = 0,

        /// <summary>Head slot.</summary>
        Head = 1,

        /// <summary>Chest slot.</summary>
        Chest = 2,

        /// <summary>Hands slot.</summary>
        Hands = 3,

        /// <summary>Legs slot.</summary>
        Legs = 4,

        /// <summary>Feet slot.</summary>
        Feet = 5,

        /// <summary>Cloak slot.</summary>
        Cloak = 6,

        /// <summary>One-handed weapon in the main hand (sword, axe, mace); off hand stays free.</summary>
        OneHanded = 7,

        /// <summary>Two-handed or paired weapon in the main hand; locks the off hand.</summary>
        TwoHanded = 8,

        /// <summary>Off hand: shield or spellbook (only with a one-handed weapon).</summary>
        OffHand = 9,

        /// <summary>Ranged slot: bow, crossbow.</summary>
        Ranged = 10,

        /// <summary>Ring (either ring slot).</summary>
        Ring = 11,

        /// <summary>Amulet slot.</summary>
        Amulet = 12,

        /// <summary>Quick slot item: potions, food, bombs, oils, tools (GDD 04 2.3).</summary>
        QuickUse = 13
    }
}
