namespace Aetherfall.Combat
{
    /// <summary>Defensive state of the defender when the hit lands (GDD 03 4.7, 4.8, 8.2 step 9).</summary>
    public enum BlockState
    {
        /// <summary>Not blocking.</summary>
        None = 0,

        /// <summary>Blocking with shield, weapon or barrier: the block reductions apply.</summary>
        Blocking = 1,

        /// <summary>Perfect parry: no damage, no poise damage, flag <see cref="HitFlags.Parried"/>.</summary>
        PerfectParry = 2
    }
}
