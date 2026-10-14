namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// One attack of a boss for the <see cref="BossBrain"/>: the enemy attack option (attack, ranges, angle, cooldown, weight)
    /// plus the first phase it is used in and whether the shield is lowered while it runs (an opening for the player).
    /// </summary>
    public sealed class BossAttackOption
    {
        /// <summary>Attack, ranges, angle, cooldown and weight.</summary>
        public EnemyAttackOption Option { get; set; }

        /// <summary>First phase (1-based) in which the boss uses the attack.</summary>
        public int MinPhase { get; set; } = 1;

        /// <summary>True: the guard is down while the attack runs (charge, spin).</summary>
        public bool DropsGuard { get; set; }

        /// <summary>True if the option can be used in the phase.</summary>
        /// <param name="phase">Current phase (1-based).</param>
        public bool AvailableIn(int phase)
        {
            return Option != null && Option.Attack != null && phase >= MinPhase;
        }
    }
}
