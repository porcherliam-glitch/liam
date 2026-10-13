using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// What happened in a hit (GDD 03 8.4). Drives the damage number display of GDD 05 1.11 ("Schwach!", "Immun", shield).
    /// </summary>
    [Flags]
    public enum HitFlags
    {
        /// <summary>Nothing special.</summary>
        None = 0,

        /// <summary>The critical roll succeeded (or the hit was a guaranteed critical).</summary>
        Critical = 1 << 0,

        /// <summary>At least one damage share hit a weakness (resistance below 0).</summary>
        Weakness = 1 << 1,

        /// <summary>At least one damage share was reduced by a positive resistance.</summary>
        Resisted = 1 << 2,

        /// <summary>At least one damage share hit an immunity.</summary>
        Immune = 1 << 3,

        /// <summary>The defender blocked.</summary>
        Blocked = 1 << 4,

        /// <summary>The defender parried perfectly: no damage.</summary>
        Parried = 1 << 5,

        /// <summary>Head hit.</summary>
        Head = 1 << 6,

        /// <summary>Weak point hit.</summary>
        WeakPoint = 1 << 7
    }
}
