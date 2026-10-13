namespace Aetherfall.Items
{
    /// <summary>
    /// Inventory categories of §12.1 (GDD 04 1.1): weapons (incl. shields), armor, jewelry, consumables, materials, quest
    /// items, books, miscellaneous. Values are stored in assets: never renumber.
    /// </summary>
    public enum ItemCategory
    {
        /// <summary>Not set (invalid for real items).</summary>
        None = 0,

        /// <summary>Weapons of the 11 weapon types and shields (German "Waffen"). Single instances.</summary>
        Weapon = 1,

        /// <summary>Armor: head, chest, hands, legs, feet, cloak (German "Ruestung"). Single instances.</summary>
        Armor = 2,

        /// <summary>Rings and amulets (German "Schmuck"). Single instances.</summary>
        Jewelry = 3,

        /// <summary>Potions, food, bombs and oils, ammunition, tools, scrolls (German "Verbrauchsgueter"). Stackable.</summary>
        Consumable = 4,

        /// <summary>Ores, wood, hides, cloth, herbs, monster parts, gems, essences (German "Materialien"). Stack of 99.</summary>
        Material = 5,

        /// <summary>Quest items (German "Questgegenstaende"): 0 kg, not sellable, not droppable (GDD 04 1.8).</summary>
        QuestItem = 6,

        /// <summary>Lore books, recipes, treasure maps, letters (German "Buecher").</summary>
        Book = 7,

        /// <summary>Junk, keys, trophies, dyes, bag upgrades (German "Sonstiges").</summary>
        Misc = 8
    }
}
