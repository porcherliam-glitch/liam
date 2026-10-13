namespace Aetherfall.AI
{
    /// <summary>Sub-phase of <see cref="EnemyStateId.Combat"/> (architecture 11.10: Annaehern, Umkreisen, Angreifen …).</summary>
    public enum EnemyCombatPhase
    {
        /// <summary>Runs towards the target until the waiting ring.</summary>
        Approach = 0,

        /// <summary>Circles the target in the waiting ring without a token (GDD 03 9.3: 4–7 m).</summary>
        Circle = 1,

        /// <summary>Has a token and closes in to attack range.</summary>
        Engage = 2,

        /// <summary>Attack running: wind-up (telegraph), hit, recovery.</summary>
        Attack = 3,

        /// <summary>Backs off after an attack.</summary>
        Retreat = 4
    }
}
