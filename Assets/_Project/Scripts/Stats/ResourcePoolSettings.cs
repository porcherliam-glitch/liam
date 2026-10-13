namespace Aetherfall.Stats
{
    /// <summary>
    /// Regeneration and exhaustion rules of a <see cref="ResourcePool"/> (GDD 03 4.3 and 10.3). Presets for health,
    /// stamina and mana use the GDD values.
    /// </summary>
    public readonly struct ResourcePoolSettings
    {
        /// <summary>Flat regeneration per second (used when no regeneration stat is bound).</summary>
        public readonly float RegenPerSecond;

        /// <summary>Additional regeneration per second as share of the maximum (0.01 = 1 % per second).</summary>
        public readonly float RegenFractionOfMaxPerSecond;

        /// <summary>Seconds after the last spending before regeneration starts.</summary>
        public readonly float RegenDelay;

        /// <summary>Seconds the pool counts as exhausted after spending brought it to 0 (0 = never exhausted).</summary>
        public readonly float ExhaustionDuration;

        /// <summary>Creates settings.</summary>
        /// <param name="regenPerSecond">Flat regeneration per second.</param>
        /// <param name="regenFractionOfMaxPerSecond">Regeneration per second as share of the maximum.</param>
        /// <param name="regenDelay">Delay after spending in seconds.</param>
        /// <param name="exhaustionDuration">Exhaustion lock after reaching 0 in seconds.</param>
        public ResourcePoolSettings(float regenPerSecond, float regenFractionOfMaxPerSecond, float regenDelay, float exhaustionDuration)
        {
            RegenPerSecond = regenPerSecond;
            RegenFractionOfMaxPerSecond = regenFractionOfMaxPerSecond;
            RegenDelay = regenDelay;
            ExhaustionDuration = exhaustionDuration;
        }

        /// <summary>No regeneration, no exhaustion (destructible objects, enemies without regeneration).</summary>
        public static ResourcePoolSettings None => new ResourcePoolSettings(0f, 0f, 0f, 0f);

        /// <summary>Stamina: 25 per second after 0.8 s without use; exhausted for 1.2 s at 0 (GDD 03 4.3).</summary>
        public static ResourcePoolSettings Stamina =>
            new ResourcePoolSettings(StatFormulas.StaminaRegenPerSecond, 0f, StatFormulas.StaminaRegenDelay, StatFormulas.StaminaExhaustionDuration);

        /// <summary>Health: 1 % of max per second after 8 s without damage (outside of combat, GDD 03 10.3).</summary>
        public static ResourcePoolSettings Health =>
            new ResourcePoolSettings(0f, StatFormulas.HealthRegenFractionPerSecond, StatFormulas.HealthRegenDelay, 0f);

        /// <summary>Mana: 6 % of max per second outside of combat (GDD 03 10.3); the owner scales it in combat and by wisdom.</summary>
        public static ResourcePoolSettings Mana => new ResourcePoolSettings(0f, StatFormulas.ManaRegenFractionOutOfCombat, 0f, 0f);
    }
}
