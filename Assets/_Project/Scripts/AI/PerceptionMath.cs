using System;
using Aetherfall.Combat;

namespace Aetherfall.AI
{
    /// <summary>
    /// Perception rules of GDD 03 9.2 as pure logic: sight zones (main cone, peripheral, near), detection rate per second
    /// <c>100 × (1 − distance ÷ range) × light × stance × cover × variant</c>, stance factors, noise radii and the detection
    /// value a heard noise sets. The enemy adapter adds the line-of-sight raycast.
    /// </summary>
    public static class PerceptionMath
    {
        /// <summary>Detection value from which an enemy becomes suspicious (GDD 03 9.2: 30).</summary>
        public const float SuspiciousThreshold = 30f;

        /// <summary>Detection value that starts combat (100).</summary>
        public const float CombatThreshold = 100f;

        /// <summary>
        /// True if a point at <paramref name="distance"/> and <paramref name="bearing"/> (degrees from the enemy's facing) lies
        /// in the main cone or the peripheral zone, or in the near zone.
        /// </summary>
        /// <param name="distance">Distance in metres.</param>
        /// <param name="bearing">Signed angle from the facing.</param>
        /// <param name="settings">Senses.</param>
        public static bool IsInSight(float distance, float bearing, in PerceptionSettings settings)
        {
            float angle = Math.Abs(bearing);
            return distance <= settings.NearRadius ||
                   (angle <= settings.MainHalfAngle && distance <= settings.MainRange) ||
                   (angle <= settings.PeripheralHalfAngle && distance <= settings.PeripheralRange);
        }

        /// <summary>
        /// Detection gain per second for a visible target (line of sight already checked). 0 outside all zones; the
        /// peripheral zone gives half the rate; the near zone counts like the main cone in every direction.
        /// </summary>
        /// <param name="distance">Distance in metres.</param>
        /// <param name="bearing">Signed angle from the facing in degrees.</param>
        /// <param name="settings">Senses.</param>
        /// <param name="stance">How noticeable the target is.</param>
        /// <param name="light">Light factor (day 1.0, dusk 0.7, night 0.4).</param>
        /// <param name="cover">Cover factor (share of visible points, high grass while sneaking ×0.4).</param>
        public static float SightRate(float distance, float bearing, in PerceptionSettings settings, PerceptionStance stance, float light = 1f,
            float cover = 1f)
        {
            if (!(settings.MainRange > 0f) || distance < 0f)
            {
                return 0f;
            }

            float angle = Math.Abs(bearing);
            float zone;
            if (distance <= settings.NearRadius || (angle <= settings.MainHalfAngle && distance <= settings.MainRange))
            {
                zone = 1f;
            }
            else if (angle <= settings.PeripheralHalfAngle && distance <= settings.PeripheralRange)
            {
                zone = 0.5f;
            }
            else
            {
                return 0f;
            }

            float closeness = Math.Max(0f, 1f - distance / settings.MainRange);
            return 100f * closeness * zone * Math.Max(0f, light) * StanceFactor(stance) * Math.Max(0f, cover) * Math.Max(0f, settings.VariantFactor);
        }

        /// <summary>
        /// True if the target is noticed at once: inside the near zone while running, sprinting or fighting (GDD 03 9.2
        /// "Laufen oder Sprinten wird sofort bemerkt, Schleichen nicht").
        /// </summary>
        /// <param name="distance">Distance in metres.</param>
        /// <param name="settings">Senses.</param>
        /// <param name="stance">Stance of the target.</param>
        public static bool IsInstantDetection(float distance, in PerceptionSettings settings, PerceptionStance stance)
        {
            return distance <= settings.NearRadius &&
                   (stance == PerceptionStance.Run || stance == PerceptionStance.Sprint || stance == PerceptionStance.Combat);
        }

        /// <summary>Stance factor of the sight rate (GDD 03 9.2): sneak 0.5, walk 0.8, run 1.0, sprint 1.3, combat 1.5.</summary>
        /// <param name="stance">Stance.</param>
        public static float StanceFactor(PerceptionStance stance)
        {
            switch (stance)
            {
                case PerceptionStance.Sneak: return 0.5f;
                case PerceptionStance.Run: return 1.0f;
                case PerceptionStance.Sprint: return 1.3f;
                case PerceptionStance.Combat: return 1.5f;
                default: return 0.8f;
            }
        }

        /// <summary>Noise radius of a stance in metres (GDD 03 9.2): sneak 2, walk 5, run 10, sprint 15, fight 25.</summary>
        /// <param name="stance">Stance.</param>
        public static float NoiseRadius(PerceptionStance stance)
        {
            switch (stance)
            {
                case PerceptionStance.Sneak: return 2f;
                case PerceptionStance.Walk: return 5f;
                case PerceptionStance.Run: return 10f;
                case PerceptionStance.Sprint: return 15f;
                case PerceptionStance.Combat: return 25f;
                default: return 0f;
            }
        }

        /// <summary>
        /// Detection value a heard noise sets at least (GDD 03 9.2): 70 in the inner half of the radius, 40 in the outer half,
        /// 0 outside.
        /// </summary>
        /// <param name="distance">Distance between noise and listener.</param>
        /// <param name="radius">Noise radius (already scaled by the hearing factor).</param>
        public static float NoiseDetection(float distance, float radius)
        {
            if (!(radius > 0f) || distance > radius)
            {
                return 0f;
            }

            return distance <= radius * 0.5f ? 70f : 40f;
        }
    }
}
