namespace Aetherfall.Combat
{
    /// <summary>
    /// Rules of the player combat state machine as plain data (GDD 03 3.2, 4.3–4.10). Built from <c>CombatSettings</c>
    /// (asset) at run time; <see cref="CreateDefault"/> returns the GDD values so the state machine is testable without
    /// Unity assets. Times in seconds.
    /// </summary>
    public sealed class CombatTuning
    {
        /// <summary>Validity of buffered attacks (GDD 03 4.4: 200 ms on all difficulties).</summary>
        public float InputBufferSeconds { get; set; } = 0.2f;

        /// <summary>Validity of buffered dodge and parry (GDD 03 4.4: 150 ms).</summary>
        public float DefensiveBufferSeconds { get; set; } = 0.15f;

        /// <summary>The combo continues if the next light attack comes this long after the last step ended (GDD 03 4.4: 0.6 s).</summary>
        public float ComboResetSeconds { get; set; } = 0.6f;

        /// <summary>Parry window after pressing block (GDD 03 4.8: 150 ms Normal, 250 Story, 120 Hard, 100 Nightmare).</summary>
        public float ParryWindowSeconds { get; set; } = 0.15f;

        /// <summary>Pressing block again sooner than this after releasing it opens no new parry window (GDD 03 4.8: 400 ms).</summary>
        public float ParryRelockSeconds { get; set; } = 0.4f;

        /// <summary>
        /// Counter window after a perfect parry (GDD 03 4.8: 1.0 s). Poise loss and open time of the parried enemy are values
        /// of its enemy type (<c>EnemyTypeDefinition</c>).
        /// </summary>
        public float CounterWindowSeconds { get; set; } = 1.0f;

        /// <summary>Hold time for charge level I (GDD 03 4.5: 0.6 s).</summary>
        public float ChargeLevel1Seconds { get; set; } = 0.6f;

        /// <summary>Hold time for charge level II (GDD 03 4.5: 1.2 s).</summary>
        public float ChargeLevel2Seconds { get; set; } = 1.2f;

        /// <summary>Longest charge; then level II is released automatically (GDD 03 4.5: 2.0 s).</summary>
        public float ChargeMaxSeconds { get; set; } = 2.0f;

        /// <summary>Hyperarmor from this hold time on (GDD 03 4.5: 0.3 s).</summary>
        public float HyperArmorAfterSeconds { get; set; } = 0.3f;

        /// <summary>Stability multiplier of hyperarmor (GDD 03 4.9: ×2).</summary>
        public float HyperArmorFactor { get; set; } = 2f;

        /// <summary>Damage multiplier of charge level I (GDD 03 4.5: ×1.9).</summary>
        public float ChargeLevel1Damage { get; set; } = 1.9f;

        /// <summary>Damage multiplier of charge level II (×2.3).</summary>
        public float ChargeLevel2Damage { get; set; } = 2.3f;

        /// <summary>Poise multiplier of charge level I (×2.0).</summary>
        public float ChargeLevel1Poise { get; set; } = 2.0f;

        /// <summary>Poise multiplier of charge level II (×2.5).</summary>
        public float ChargeLevel2Poise { get; set; } = 2.5f;

        /// <summary>Extra stamina of charge level I (GDD 03 4.5: +6).</summary>
        public float ChargeLevel1Stamina { get; set; } = 6f;

        /// <summary>Extra stamina of charge level II (+12).</summary>
        public float ChargeLevel2Stamina { get; set; } = 12f;

        /// <summary>Sprinting at least this long turns a light attack into the sprint attack (GDD 03 4.6: 0.5 s).</summary>
        public float SprintAttackMinSprintSeconds { get; set; } = 0.5f;

        /// <summary>Dodge roll with direction input (GDD 03 3.2; light armor for now).</summary>
        public DodgeProfile Roll { get; set; } = DodgeProfile.Light;

        /// <summary>Back step without direction input (GDD 03 3.2).</summary>
        public DodgeProfile BackStep { get; set; } = DodgeProfile.BackStep;

        /// <summary>Stagger after reaching the stability (GDD 03 4.9: 0.5 s).</summary>
        public float StaggerSeconds { get; set; } = 0.5f;

        /// <summary>Knockdown after a hit of twice the stability (GDD 03 4.9: 1.2 s).</summary>
        public float KnockdownSeconds { get; set; } = 1.2f;

        /// <summary>Guard break when a blocked hit empties the stamina (GDD 03 4.3: 1.0 s).</summary>
        public float GuardBreakSeconds { get; set; } = 1.0f;

        /// <summary>Summation window of the stability (GDD 03 4.9: 3 s).</summary>
        public float StabilityWindowSeconds { get; set; } = 3f;

        /// <summary>Stamina regeneration factor while blocking (GDD 03 4.3: halved).</summary>
        public float BlockStaminaRegenFactor { get; set; } = 0.5f;

        /// <summary>Movement speed while blocking (GDD 03 3.1: 2.5 m/s).</summary>
        public float BlockMoveSpeed { get; set; } = 2.5f;

        /// <summary>Finisher range (GDD 03 4.10: 2.5 m).</summary>
        public float FinisherRange { get; set; } = 2.5f;

        /// <summary>Finisher half angle in front of the player (GDD 03 4.10: ±60°).</summary>
        public float FinisherHalfAngle { get; set; } = 60f;

        /// <summary>
        /// Finisher damage as share of the target's max health (GDD 03 4.10: Normal 35 %); the "weapon damage × 5" part is the
        /// damage multiplier of the finisher attack asset.
        /// </summary>
        public float FinisherHealthShare { get; set; } = 0.35f;

        /// <summary>Normal enemies die after a finisher if at most this share of health is left (GDD 03 4.10: 15 %).</summary>
        public float FinisherKillThreshold { get; set; } = 0.15f;

        /// <summary>Returns a new instance with the values of GDD 03.</summary>
        public static CombatTuning CreateDefault()
        {
            return new CombatTuning();
        }

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(InputBufferSeconds >= 0f && DefensiveBufferSeconds >= 0f && ComboResetSeconds >= 0f))
            {
                return "Buffer and combo reset times must be 0 or more.";
            }

            if (!(ParryWindowSeconds >= 0f && ParryRelockSeconds >= 0f && CounterWindowSeconds >= 0f))
            {
                return "Parry times must be 0 or more.";
            }

            if (!(ChargeLevel1Seconds > 0f && ChargeLevel2Seconds >= ChargeLevel1Seconds && ChargeMaxSeconds >= ChargeLevel2Seconds))
            {
                return "Charge times must satisfy 0 < level I <= level II <= max.";
            }

            if (!(Roll.Duration > 0f && BackStep.Duration > 0f))
            {
                return "Dodge durations must be greater than 0.";
            }

            if (!(StaggerSeconds >= 0f && KnockdownSeconds >= 0f && GuardBreakSeconds >= 0f && StabilityWindowSeconds > 0f))
            {
                return "Stagger times must be 0 or more and the stability window greater than 0.";
            }

            return string.Empty;
        }
    }
}
