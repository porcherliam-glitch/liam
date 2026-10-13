namespace Aetherfall.Combat
{
    /// <summary>Hurtbox zone of a hit (GDD 03 8.2 step 4, architecture 11.4). Stored on hurtboxes: never renumber.</summary>
    public enum HitZone
    {
        /// <summary>Body: × 1.0.</summary>
        Body = 0,

        /// <summary>Limb: × 0.9.</summary>
        Limb = 1,

        /// <summary>Head: × 1.5 melee, × 1.75 ranged/projectile.</summary>
        Head = 2,

        /// <summary>Weak point: × 2.0.</summary>
        WeakPoint = 3
    }
}
