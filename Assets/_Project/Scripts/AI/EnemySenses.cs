using System;
using Aetherfall.Combat;

namespace Aetherfall.AI
{
    /// <summary>
    /// What an enemy perceives this frame, filled by the scene adapter (positions, line of sight, stance of the target)
    /// for the pure <see cref="EnemyBrain"/>.
    /// </summary>
    public struct EnemySenses
    {
        // Stored as darkness, so a default struct means daylight (light factor 1).
        private float _darkness;

        /// <summary>A living hostile target exists (the player).</summary>
        public bool HasTarget { get; set; }

        /// <summary>Own position.</summary>
        public FlatPoint Self { get; set; }

        /// <summary>Own facing in degrees.</summary>
        public float SelfYaw { get; set; }

        /// <summary>Position of the target (valid with <see cref="HasTarget"/>).</summary>
        public FlatPoint Target { get; set; }

        /// <summary>True if the target is inside a sight zone and not hidden behind obstacles.</summary>
        public bool TargetVisible { get; set; }

        /// <summary>Stance of the target (sight factor, noise radius).</summary>
        public PerceptionStance TargetStance { get; set; }

        /// <summary>
        /// Light factor where the target stands (GDD 03 9.2: day 1.0, dusk 0.7, night 0.4, at night near a lit fire 0.9); default 1.
        /// </summary>
        public float TargetLight
        {
            get => 1f - _darkness;
            set => _darkness = 1f - Math.Max(0f, Math.Min(1f, value));
        }

        /// <summary>False if the target cannot be reached (too high, blocked); counts towards the 8 s leash rule.</summary>
        public bool TargetReachable { get; set; }

        /// <summary>The target hit this enemy this frame.</summary>
        public bool WasHitByTarget { get; set; }

        /// <summary>The target is protected from new attacks (finisher, GDD 03 4.10).</summary>
        public bool TargetProtected { get; set; }

        /// <summary>Own health relative to the maximum (flee rule).</summary>
        public float HealthFraction { get; set; }
    }
}
