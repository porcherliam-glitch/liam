namespace Aetherfall.Stats
{
    /// <summary>
    /// Limits of one stat (GDD 03 10.5): an optional soft cap (above it, only a share of the excess counts) and a hard
    /// range. Applied after all modifiers: first the soft cap, then the clamp to <see cref="Min"/>/<see cref="Max"/>.
    /// </summary>
    public readonly struct StatRule
    {
        /// <summary>Default share of the excess above the soft cap that still counts ("darueber halbe Wirkung").</summary>
        public const float DefaultSoftCapFactor = 0.5f;

        /// <summary>Lowest value.</summary>
        public readonly float Min;

        /// <summary>Highest value (hard cap).</summary>
        public readonly float Max;

        /// <summary>Soft cap; <see cref="float.PositiveInfinity"/> = none.</summary>
        public readonly float SoftCap;

        /// <summary>Share of the excess above <see cref="SoftCap"/> that counts (0–1).</summary>
        public readonly float SoftCapFactor;

        /// <summary>Creates a rule.</summary>
        /// <param name="min">Lowest value.</param>
        /// <param name="max">Highest value.</param>
        /// <param name="softCap">Soft cap (infinity = none).</param>
        /// <param name="softCapFactor">Share of the excess above the soft cap that counts.</param>
        public StatRule(float min, float max, float softCap = float.PositiveInfinity, float softCapFactor = DefaultSoftCapFactor)
        {
            Min = min;
            Max = max;
            SoftCap = softCap;
            SoftCapFactor = softCapFactor;
        }

        /// <summary>No limits at all.</summary>
        public static StatRule Unbounded => new StatRule(float.NegativeInfinity, float.PositiveInfinity);

        /// <summary>Only a lower bound.</summary>
        /// <param name="min">Lowest value.</param>
        public static StatRule AtLeast(float min)
        {
            return new StatRule(min, float.PositiveInfinity);
        }

        /// <summary>A hard range without soft cap.</summary>
        /// <param name="min">Lowest value.</param>
        /// <param name="max">Highest value.</param>
        public static StatRule Range(float min, float max)
        {
            return new StatRule(min, max);
        }

        /// <summary>True if a soft cap is set.</summary>
        public bool HasSoftCap => !float.IsInfinity(SoftCap);

        /// <summary>Applies soft cap and clamp to a raw value.</summary>
        /// <param name="value">Value after all modifiers.</param>
        public float Apply(float value)
        {
            if (HasSoftCap && value > SoftCap)
            {
                value = SoftCap + (value - SoftCap) * SoftCapFactor;
            }

            if (value < Min)
            {
                return Min;
            }

            return value > Max ? Max : value;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "StatRule(" + Min + " .. " + Max + (HasSoftCap ? ", soft cap " + SoftCap + " x" + SoftCapFactor : string.Empty) + ")";
        }
    }
}
