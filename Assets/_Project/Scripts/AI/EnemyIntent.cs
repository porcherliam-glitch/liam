namespace Aetherfall.AI
{
    /// <summary>Movement wish of the <see cref="EnemyBrain"/> for this frame, executed by the scene adapter.</summary>
    public struct EnemyIntent
    {
        /// <summary>How to move.</summary>
        public EnemyMoveMode Mode { get; set; }

        /// <summary>Destination (walk, run) or the point to keep distance from (retreat, flee, circle centre).</summary>
        public FlatPoint Destination { get; set; }

        /// <summary>Speed in m/s.</summary>
        public float Speed { get; set; }

        /// <summary>Turn towards the target instead of the movement direction.</summary>
        public bool FaceTarget { get; set; }

        /// <summary>Circling direction: +1 clockwise, −1 counter-clockwise.</summary>
        public int CircleDirection { get; set; }

        /// <summary>Wanted distance to the target while circling.</summary>
        public float RingDistance { get; set; }
    }
}
