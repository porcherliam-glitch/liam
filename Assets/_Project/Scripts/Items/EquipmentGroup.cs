namespace Aetherfall.Items
{
    /// <summary>
    /// Group of random equipment for the loot generator (GDD 04 5.1 example: "Waffen 50 %, Ruestung 40 %, Schmuck 10 %").
    /// Shields count as weapons (inventory category "Waffen", GDD 04 1.1).
    /// </summary>
    public enum EquipmentGroup
    {
        /// <summary>No equipment.</summary>
        None = 0,

        /// <summary>Weapons and shields.</summary>
        Weapon = 1,

        /// <summary>Armor pieces and cloaks.</summary>
        Armor = 2,

        /// <summary>Rings and amulets.</summary>
        Jewelry = 3
    }
}
