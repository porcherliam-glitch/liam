namespace Aetherfall.Items
{
    /// <summary>
    /// The 11 weapon types of §9.3 (GDD 03 5.1) plus shields. The moveset per type lives in Combat (WeaponDefinition); items
    /// only carry the type and the weapon damage W. Values are stored in assets: never renumber.
    /// </summary>
    public enum WeaponType
    {
        /// <summary>No weapon.</summary>
        None = 0,

        /// <summary>One-handed sword (German "Einhandschwert"), base 20.</summary>
        OneHandedSword = 1,

        /// <summary>Two-handed sword (German "Zweihandschwert"), base 30.</summary>
        TwoHandedSword = 2,

        /// <summary>Paired daggers (German "Dolche"), base 13 per stab.</summary>
        Daggers = 3,

        /// <summary>Axe, one-handed (German "Axt"), base 22.</summary>
        Axe = 4,

        /// <summary>One-handed mace (German "Einhand-Streitkolben"), base 21.</summary>
        Mace = 5,

        /// <summary>Two-handed hammer (German "Zweihand-Hammer"), base 34.</summary>
        WarHammer = 6,

        /// <summary>Spear (German "Speer"), base 23.</summary>
        Spear = 7,

        /// <summary>Paired fist weapons (German "Faustwaffen"), base 12.</summary>
        FistWeapons = 8,

        /// <summary>Bow (German "Bogen"), base 18.</summary>
        Bow = 9,

        /// <summary>Crossbow (German "Armbrust"), base 29.</summary>
        Crossbow = 10,

        /// <summary>Staff (German "Zauberstab"), spell power 20.</summary>
        Staff = 11,

        /// <summary>Spellbook (German "Zauberbuch"), spell power 12, off hand.</summary>
        Spellbook = 12,

        /// <summary>Shield (German "Schild"), armor 6 plus block values.</summary>
        Shield = 13
    }
}
