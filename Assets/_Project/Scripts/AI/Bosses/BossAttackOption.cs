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

        /// <summary>Last phase in which the attack is used (e.g. the war horn only in phase 1).</summary>
        public int MaxPhase { get; set; } = int.MaxValue;

        /// <summary>
        /// Key of a special attack (empty = a normal hit): the controller tells the boss mechanics when its wind-up starts and
        /// when it fires (war horn, crane, fire pot) instead of opening the hitbox.
        /// </summary>
        public string Special { get; set; } = string.Empty;

        /// <summary>True for a special attack.</summary>
        public bool IsSpecial => !string.IsNullOrEmpty(Special);

        /// <summary>True: the guard is down while the attack runs (charge, spin).</summary>
        public bool DropsGuard { get; set; }

        /// <summary>True if the option can be used in the phase.</summary>
        /// <param name="phase">Current phase (1-based).</param>
        public bool AvailableIn(int phase)
        {
            return Option != null && Option.Attack != null && phase >= MinPhase && phase <= MaxPhase;
        }
    }
}
