namespace Aetherfall.Combat
{
    /// <summary>Phase of a running attack (GDD 03 4.4: "Ausholen → Aktiv (Hitbox an) → Erholung").</summary>
    public enum AttackPhase
    {
        /// <summary>No attack is running.</summary>
        None = 0,

        /// <summary>Wind-up (the telegraph of enemies, GDD 03 9.5).</summary>
        Windup = 1,

        /// <summary>Active: the hit window is open.</summary>
        Active = 2,

        /// <summary>Recovery after the hit window.</summary>
        Recovery = 3
    }
}
