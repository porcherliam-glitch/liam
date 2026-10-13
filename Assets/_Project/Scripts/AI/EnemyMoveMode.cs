namespace Aetherfall.AI
{
    /// <summary>How the enemy adapter should move this frame (<see cref="EnemyIntent"/>).</summary>
    public enum EnemyMoveMode
    {
        /// <summary>Stand still.</summary>
        Stop = 0,

        /// <summary>Walk to the destination.</summary>
        Walk = 1,

        /// <summary>Run to the destination.</summary>
        Run = 2,

        /// <summary>Circle around the target (strafe), facing it.</summary>
        Circle = 3,

        /// <summary>Back off from the target, facing it.</summary>
        Retreat = 4,

        /// <summary>Run away from the target.</summary>
        Flee = 5,

        /// <summary>Forward impulse of the running attack (lunge).</summary>
        Lunge = 6
    }
}
