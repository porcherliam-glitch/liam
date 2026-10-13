namespace Aetherfall.Combat
{
    /// <summary>
    /// Side of a combatant. Hitboxes never hurt their own side (no friendly fire, GDD 03 13.3 "Friendly Fire aus") and never
    /// the attacker itself; <see cref="Neutral"/> targets (training dummy, destructible objects) can be hit by everyone.
    /// Stored on scene objects: never renumber.
    /// </summary>
    public enum CombatTeam
    {
        /// <summary>Hit by everyone, hits nobody on purpose (training dummy, crates).</summary>
        Neutral = 0,

        /// <summary>The player and companions.</summary>
        Player = 1,

        /// <summary>Hostile creatures and people.</summary>
        Enemy = 2
    }
}
