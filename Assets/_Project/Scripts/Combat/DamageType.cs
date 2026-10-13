namespace Aetherfall.Combat
{
    /// <summary>
    /// The seven damage types of §9.7, with physical damage split into slash, stab and blunt (GDD 03 8.1).
    /// Values index arrays and may be stored: never renumber.
    /// </summary>
    public enum DamageType
    {
        /// <summary>Physical slash: builds up bleeding.</summary>
        Slash = 0,

        /// <summary>Physical stab: +5 percentage points critical chance.</summary>
        Stab = 1,

        /// <summary>Physical blunt: armor counts only 80 %, poise factor 1.3.</summary>
        Blunt = 2,

        /// <summary>Fire: armor does not apply, builds up burning.</summary>
        Fire = 3,

        /// <summary>Ice: armor does not apply, builds up freezing.</summary>
        Ice = 4,

        /// <summary>Lightning: armor does not apply, builds up shock.</summary>
        Lightning = 5,

        /// <summary>Poison: armor does not apply, builds up poison.</summary>
        Poison = 6,

        /// <summary>Shadow: armor does not apply, builds up curse.</summary>
        Shadow = 7,

        /// <summary>Aether: armor does not apply; consecrated attacks carry this type.</summary>
        Aether = 8
    }
}
