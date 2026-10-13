namespace Aetherfall.AI
{
    /// <summary>
    /// Senses of an enemy type (GDD 03 9.2): main cone 100° (±50°) up to 22 m by day, peripheral 160° (±80°) up to 10 m at
    /// half rate, near zone 2.5 m all around, variant factor (normal 1.0, elite 1.2, guard 1.3, wild animal 1.5), hearing
    /// factor and the decay of the detection value. Immutable value type.
    /// </summary>
    public readonly struct PerceptionSettings
    {
        /// <summary>Half angle of the main cone in degrees (50).</summary>
        public readonly float MainHalfAngle;

        /// <summary>Range of the main cone in metres (22 by day).</summary>
        public readonly float MainRange;

        /// <summary>Half angle of the peripheral zone in degrees (80).</summary>
        public readonly float PeripheralHalfAngle;

        /// <summary>Range of the peripheral zone in metres (10).</summary>
        public readonly float PeripheralRange;

        /// <summary>Radius of the near zone in metres (2.5): running or sprinting there is noticed at once.</summary>
        public readonly float NearRadius;

        /// <summary>Variant factor of the detection rate (wild animal 1.5).</summary>
        public readonly float VariantFactor;

        /// <summary>Factor on all noise radii (1 = normal hearing).</summary>
        public readonly float HearingFactor;

        /// <summary>Creates the settings.</summary>
        /// <param name="mainHalfAngle">Main cone half angle.</param>
        /// <param name="mainRange">Main cone range.</param>
        /// <param name="peripheralHalfAngle">Peripheral half angle.</param>
        /// <param name="peripheralRange">Peripheral range.</param>
        /// <param name="nearRadius">Near radius.</param>
        /// <param name="variantFactor">Variant factor.</param>
        /// <param name="hearingFactor">Hearing factor.</param>
        public PerceptionSettings(float mainHalfAngle, float mainRange, float peripheralHalfAngle, float peripheralRange, float nearRadius,
            float variantFactor, float hearingFactor)
        {
            MainHalfAngle = mainHalfAngle;
            MainRange = mainRange;
            PeripheralHalfAngle = peripheralHalfAngle;
            PeripheralRange = peripheralRange;
            NearRadius = nearRadius;
            VariantFactor = variantFactor;
            HearingFactor = hearingFactor;
        }

        /// <summary>GDD 03 9.2 values with variant factor 1.0 (normal enemy).</summary>
        public static PerceptionSettings Default => new PerceptionSettings(50f, 22f, 80f, 10f, 2.5f, 1f, 1f);
    }
}
