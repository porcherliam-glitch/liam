namespace Aetherfall.Combat
{
    /// <summary>What <see cref="IDamageable.ApplyDamage"/> did.</summary>
    public readonly struct DamageOutcome
    {
        /// <summary>Health actually removed (0 if ignored).</summary>
        public readonly float Applied;

        /// <summary>Health after the hit.</summary>
        public readonly float HealthAfter;

        /// <summary>True if this hit killed the target (true for exactly one hit).</summary>
        public readonly bool Killed;

        /// <summary>Why nothing was applied, or <see cref="DamageIgnoredReason.None"/>.</summary>
        public readonly DamageIgnoredReason IgnoredReason;

        /// <summary>Creates an outcome.</summary>
        /// <param name="applied">Removed health.</param>
        /// <param name="healthAfter">Health after the hit.</param>
        /// <param name="killed">True if the hit killed.</param>
        /// <param name="ignoredReason">Reason if nothing was applied.</param>
        public DamageOutcome(float applied, float healthAfter, bool killed, DamageIgnoredReason ignoredReason)
        {
            Applied = applied;
            HealthAfter = healthAfter;
            Killed = killed;
            IgnoredReason = ignoredReason;
        }

        /// <summary>True if the damage was applied.</summary>
        public bool WasApplied => IgnoredReason == DamageIgnoredReason.None;
    }
}
