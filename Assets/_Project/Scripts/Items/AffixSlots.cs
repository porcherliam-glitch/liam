using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Allowed item slots of an affix (GDD 04 4.4 slot codes: W all weapons, WN melee, WF bow and crossbow, WM staff and
    /// spellbook, R all 6 armor slots, S shield, Ri ring, Am amulet). Stored in assets as bit mask: never renumber.
    /// </summary>
    [Flags]
    public enum AffixSlots
    {
        /// <summary>Nowhere.</summary>
        None = 0,

        /// <summary>Melee weapons (WN).</summary>
        MeleeWeapon = 1,

        /// <summary>Bow and crossbow (WF).</summary>
        RangedWeapon = 2,

        /// <summary>Staff and spellbook (WM).</summary>
        MagicWeapon = 4,

        /// <summary>Head.</summary>
        Head = 8,

        /// <summary>Chest.</summary>
        Chest = 16,

        /// <summary>Hands.</summary>
        Hands = 32,

        /// <summary>Legs.</summary>
        Legs = 64,

        /// <summary>Feet.</summary>
        Feet = 128,

        /// <summary>Cloak.</summary>
        Cloak = 256,

        /// <summary>Shield (S).</summary>
        Shield = 512,

        /// <summary>Ring (Ri).</summary>
        Ring = 1024,

        /// <summary>Amulet (Am).</summary>
        Amulet = 2048,

        /// <summary>All weapons (W).</summary>
        AllWeapons = MeleeWeapon | RangedWeapon | MagicWeapon,

        /// <summary>All six armor slots (R).</summary>
        AllArmor = Head | Chest | Hands | Legs | Feet | Cloak
    }
}
