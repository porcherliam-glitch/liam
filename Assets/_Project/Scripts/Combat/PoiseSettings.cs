namespace Aetherfall.Combat
{
    /// <summary>
    /// Rules of a <see cref="PoiseMeter"/> (GDD 03 4.9 table): regeneration delay and rate, stun duration on break, flinch
    /// threshold and (bosses) growth of the maximum per break. Immutable value type.
    /// </summary>
    public readonly struct PoiseSettings
    {
        /// <summary>Seconds without poise damage before the build-up falls again (Normal 2.5, Boss 4).</summary>
        public readonly float RegenDelay;

        /// <summary>Share of the maximum the build-up falls per second after the delay (Normal 0.15, Boss 0.08).</summary>
        public readonly float RegenFractionPerSecond;

        /// <summary>Stun duration after a break in seconds (Normal 3.0, Elite/Champion 2.5, Boss 4.0).</summary>
        public readonly float BreakStunSeconds;

        /// <summary>Share of the maximum from which a single hit makes the target flinch (GDD 03 4.11: 0.08).</summary>
        public readonly float FlinchThresholdFraction;

        /// <summary>Growth of the maximum per break (Boss 0.25), 0 for normal enemies.</summary>
        public readonly float MaxGrowthPerBreak;

        /// <summary>Highest total growth of the maximum (Boss 0.75).</summary>
        public readonly float MaxGrowthCap;

        /// <summary>Creates the settings.</summary>
        /// <param name="regenDelay">Regeneration delay in seconds.</param>
        /// <param name="regenFractionPerSecond">Regeneration per second as share of the maximum.</param>
        /// <param name="breakStunSeconds">Stun duration after a break.</param>
        /// <param name="flinchThresholdFraction">Flinch threshold as share of the maximum.</param>
        /// <param name="maxGrowthPerBreak">Growth of the maximum per break.</param>
        /// <param name="maxGrowthCap">Highest total growth.</param>
        public PoiseSettings(float regenDelay, float regenFractionPerSecond, float breakStunSeconds, float flinchThresholdFraction,
            float maxGrowthPerBreak = 0f, float maxGrowthCap = 0f)
        {
            RegenDelay = regenDelay;
            RegenFractionPerSecond = regenFractionPerSecond;
            BreakStunSeconds = breakStunSeconds;
            FlinchThresholdFraction = flinchThresholdFraction;
            MaxGrowthPerBreak = maxGrowthPerBreak;
            MaxGrowthCap = maxGrowthCap;
        }

        /// <summary>Normal enemies (GDD 03 4.9): 2.5 s delay, 15 %/s, stunned 3.0 s.</summary>
        public static PoiseSettings Normal => new PoiseSettings(2.5f, 0.15f, 3.0f, 0.08f);

        /// <summary>Elite and champion (GDD 03 4.9): like Normal, stunned 2.5 s.</summary>
        public static PoiseSettings Elite => new PoiseSettings(2.5f, 0.15f, 2.5f, 0.08f);

        /// <summary>Bosses (GDD 03 4.9): 4 s delay, 8 %/s, stunned 4.0 s, maximum +25 % per break up to +75 %.</summary>
        public static PoiseSettings Boss => new PoiseSettings(4f, 0.08f, 4f, 0.08f, 0.25f, 0.75f);
    }
}
