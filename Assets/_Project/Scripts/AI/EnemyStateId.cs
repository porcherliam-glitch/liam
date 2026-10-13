namespace Aetherfall.AI
{
    /// <summary>
    /// Top states of the enemy state machine (§20.2, GDD 03 9.1): patrol, guard, suspicious, search, combat, flee, return,
    /// plus stunned (poise break or opened by a parry) and dead.
    /// </summary>
    public enum EnemyStateId
    {
        /// <summary>Walks a route of waypoints.</summary>
        Patrol = 0,

        /// <summary>Stands at its post and looks around.</summary>
        Guard = 1,

        /// <summary>Noticed something (detection ≥ 30): turns towards it, 3 s.</summary>
        Suspicious = 2,

        /// <summary>Goes to the last known position and searches around it, 20 s.</summary>
        Search = 3,

        /// <summary>Fights (sub-phases in <see cref="EnemyCombatPhase"/>).</summary>
        Combat = 4,

        /// <summary>Runs away (low health, animals).</summary>
        Flee = 5,

        /// <summary>Returns to its anchor (leash), regenerates, ignores stimuli for 3 s.</summary>
        Return = 6,

        /// <summary>Stunned: poise broken (finisher possible) or opened by a perfect parry.</summary>
        Stunned = 7,

        /// <summary>Dead.</summary>
        Dead = 8
    }
}
