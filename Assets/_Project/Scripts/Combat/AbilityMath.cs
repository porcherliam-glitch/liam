using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Small formulas of the abilities (GDD 03 6.4): damage of a chain jump, the next chain target and the spread of strikes
    /// without enemies. Pure C# on plain floats (positions on the ground plane), so it is easy to test.
    /// </summary>
    public static class AbilityMath
    {
        /// <summary>Golden angle in degrees: strikes without enemies spread evenly around the centre.</summary>
        private const float GoldenAngle = 137.50776f;

        /// <summary>Damage factor of the n-th jump (0 = first target): (1 − falloff)^jump (Kettenblitz: 1, 0.8, 0.64).</summary>
        /// <param name="jump">Jump index, 0 for the first target.</param>
        /// <param name="falloff">Loss per jump (0.2 = −20 %).</param>
        public static float ChainFactor(int jump, float falloff)
        {
            float keep = 1f - Math.Max(0f, Math.Min(1f, falloff));
            return (float)Math.Pow(keep, Math.Max(0, jump));
        }

        /// <summary>The nearest unused candidate within <paramref name="range"/> of a point, or −1.</summary>
        /// <param name="fromX">X of the last target.</param>
        /// <param name="fromZ">Z of the last target.</param>
        /// <param name="xs">X of the candidates.</param>
        /// <param name="zs">Z of the candidates.</param>
        /// <param name="used">True for candidates already hit.</param>
        /// <param name="count">Number of candidates.</param>
        /// <param name="range">Farthest jump in metres.</param>
        public static int NextChainTarget(float fromX, float fromZ, float[] xs, float[] zs, bool[] used, int count, float range)
        {
            if (xs == null || zs == null || used == null)
            {
                return -1;
            }

            int best = -1;
            float bestDistance = range * range;
            int n = Math.Min(count, Math.Min(xs.Length, Math.Min(zs.Length, used.Length)));
            for (int i = 0; i < n; i++)
            {
                if (used[i])
                {
                    continue;
                }

                float dx = xs[i] - fromX;
                float dz = zs[i] - fromZ;
                float distance = dx * dx + dz * dz;
                if (distance <= bestDistance)
                {
                    best = i;
                    bestDistance = distance;
                }
            }

            return best;
        }

        /// <summary>
        /// Offset of a strike from the centre when no enemy is there to aim at: the first strike in the centre, the others on a
        /// spiral within 70 % of the radius (golden angle, so they never stack).
        /// </summary>
        /// <param name="index">Strike index from 0.</param>
        /// <param name="radius">Radius of the area.</param>
        /// <param name="dx">Offset in X.</param>
        /// <param name="dz">Offset in Z.</param>
        public static void StrikeOffset(int index, float radius, out float dx, out float dz)
        {
            if (index <= 0 || radius <= 0f)
            {
                dx = 0f;
                dz = 0f;
                return;
            }

            float distance = radius * 0.7f * (float)Math.Sqrt(Math.Min(1.0, index / 4.0));
            double angle = index * GoldenAngle * Math.PI / 180.0;
            dx = (float)Math.Sin(angle) * distance;
            dz = (float)Math.Cos(angle) * distance;
        }
    }
}
