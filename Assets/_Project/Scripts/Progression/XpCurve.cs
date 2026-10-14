using System;

namespace Aetherfall.Progression
{
    /// <summary>
    /// The experience curve of GDD 03 12.3: <c>XP_next(L) = round_to_10(200 × L × (1 + (L / 30)²))</c> for L = 1 … 79,
    /// level 80 is the last level (paragon follows later, GDD 04). With the default parameters the total up to level 80 is
    /// exactly 2,851,020 XP and the milestones of GDD 03 12.5 hold (level 5: 1,030 to the next level, 2,020 in total).
    /// </summary>
    /// <remarks>
    /// Pure and immutable: the table of all levels is computed once in the constructor. The parameters (200, 30, exponent 2)
    /// are tunable in <see cref="XpCurveSettings"/> (§28 "zentral einstellbar"). Rounding to 10 is "half away from zero"; with
    /// the default parameters no value lies exactly on a half.
    /// </remarks>
    public sealed class XpCurve
    {
        /// <summary>Base factor (GDD 03 12.3: 200).</summary>
        public const float DefaultBaseXp = 200f;

        /// <summary>Level divisor of the cubic part (GDD 03 12.3: 30).</summary>
        public const float DefaultLevelDivisor = 30f;

        /// <summary>Exponent of the cubic part (GDD 03 12.3: 2).</summary>
        public const float DefaultExponent = 2f;

        /// <summary>Highest level (GDD 03 12.1, §11.3: 80).</summary>
        public const int DefaultMaxLevel = 80;

        private readonly int[] _toNext;
        private readonly int[] _total;

        /// <summary>Creates the curve and its table.</summary>
        /// <param name="baseXp">Base factor (at least 1).</param>
        /// <param name="levelDivisor">Level divisor (at least 1).</param>
        /// <param name="exponent">Exponent (0 or more).</param>
        /// <param name="maxLevel">Highest level (2 to 200).</param>
        public XpCurve(float baseXp = DefaultBaseXp, float levelDivisor = DefaultLevelDivisor, float exponent = DefaultExponent,
            int maxLevel = DefaultMaxLevel)
        {
            BaseXp = Math.Max(1f, baseXp);
            LevelDivisor = Math.Max(1f, levelDivisor);
            Exponent = Math.Max(0f, exponent);
            MaxLevel = Math.Max(2, Math.Min(200, maxLevel));
            _toNext = new int[MaxLevel + 1];
            _total = new int[MaxLevel + 1];
            long total = 0;
            for (int level = 1; level <= MaxLevel; level++)
            {
                _total[level] = (int)Math.Min(int.MaxValue, total);
                _toNext[level] = level < MaxLevel ? Compute(level) : 0;
                total += _toNext[level];
            }
        }

        /// <summary>The curve with the values of GDD 03 12.3.</summary>
        public static XpCurve Default => new XpCurve();

        /// <summary>Base factor.</summary>
        public float BaseXp { get; }

        /// <summary>Level divisor.</summary>
        public float LevelDivisor { get; }

        /// <summary>Exponent.</summary>
        public float Exponent { get; }

        /// <summary>Highest level.</summary>
        public int MaxLevel { get; }

        /// <summary>Experience needed from the start of the max level: the total of all levels (2,851,020 by default).</summary>
        public int TotalToMaxLevel => _total[MaxLevel];

        /// <summary>XP from level <paramref name="level"/> to the next one; 0 at the max level and above.</summary>
        /// <param name="level">Level (values below 1 count as 1).</param>
        public int XpToNext(int level)
        {
            if (level >= MaxLevel)
            {
                return 0;
            }

            return _toNext[Math.Max(1, level)];
        }

        /// <summary>Total experience when reaching a level (level 1: 0).</summary>
        /// <param name="level">Level (clamped to 1 … max).</param>
        public int TotalXpAt(int level)
        {
            return _total[Math.Max(1, Math.Min(MaxLevel, level))];
        }

        /// <summary>The level that a total amount of experience reaches.</summary>
        /// <param name="totalXp">Total experience (negative = 0).</param>
        public int LevelForTotalXp(long totalXp)
        {
            int level = 1;
            while (level < MaxLevel && totalXp >= _total[level + 1])
            {
                level++;
            }

            return level;
        }

        /// <summary>
        /// Experience of a reward given as level share (GDD 02 4.1 "0,5 Lv", GDD 03 12.7): share × XP_next(reference level),
        /// rounded to whole XP. Examples of GDD 03 12.3: 0.5 Lv at level 3 = 305 XP, 0.6 Lv at level 7 = 888 XP.
        /// </summary>
        /// <param name="share">Level share (0 or less = 0).</param>
        /// <param name="referenceLevel">Reference level (recommended level of the content, or the player level).</param>
        public int LevelShareToXp(float share, int referenceLevel)
        {
            if (share <= 0f || float.IsNaN(share))
            {
                return 0;
            }

            int toNext = XpToNext(Math.Min(referenceLevel, MaxLevel - 1));
            return (int)Math.Round(share * toNext, MidpointRounding.AwayFromZero);
        }

        private int Compute(int level)
        {
            double ratio = level / (double)LevelDivisor;
            double raw = BaseXp * level * (1.0 + Math.Pow(ratio, Exponent));
            double rounded = Math.Round(raw / 10.0, MidpointRounding.AwayFromZero) * 10.0;
            return (int)Math.Max(10.0, Math.Min(int.MaxValue / 4.0, rounded));
        }
    }
}
