namespace Aetherfall.AI.Bosses
{
    /// <summary>What a <see cref="BossBrain"/> knows in a tick (plain values, filled by the <see cref="BossController"/>).</summary>
    public struct BossSenses
    {
        /// <summary>Own position on the ground plane.</summary>
        public FlatPoint Self { get; set; }

        /// <summary>Own yaw in degrees.</summary>
        public float SelfYaw { get; set; }

        /// <summary>True if a living target exists.</summary>
        public bool HasTarget { get; set; }

        /// <summary>Target position on the ground plane.</summary>
        public FlatPoint Target { get; set; }

        /// <summary>True if the target stands inside the encounter area (starts the fight).</summary>
        public bool TargetInArena { get; set; }

        /// <summary>
        /// True if the target stands outside the closed arena (the room behind the arena gate). During the fight this lasting
        /// longer than <see cref="BossBrainSettings.LeaveArenaResetSeconds"/> starts the encounter over.
        /// </summary>
        public bool TargetLeftArena { get; set; }

        /// <summary>Own health from 0 to 1.</summary>
        public float HealthFraction { get; set; }
    }
}
