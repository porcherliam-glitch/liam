using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Lock-on target selection as pure logic (architecture 11.2: "Lock-On-Zielwahl liegt in Combat"; GDD 03 2.3): a cone of
    /// ±30° around the camera direction, range 25 m, weighting angle 60 % and distance 40 %; switching picks the nearest
    /// candidate on the requested side; the lock-on camera distance follows GDD 03 2.1.
    /// </summary>
    public static class TargetingMath
    {
        /// <summary>Weight of the angle in the score (GDD 03 2.3: 60 %).</summary>
        public const float AngleWeight = 0.6f;

        /// <summary>Weight of the distance in the score (GDD 03 2.3: 40 %).</summary>
        public const float DistanceWeight = 0.4f;

        /// <summary>
        /// Score of a candidate for the first lock-on: lower is better, −1 = outside the cone or out of range.
        /// </summary>
        /// <param name="bearing">Signed angle between the camera direction and the candidate in degrees.</param>
        /// <param name="distance">Distance to the candidate in metres.</param>
        /// <param name="coneHalfAngle">Half angle of the cone (GDD: 30°).</param>
        /// <param name="range">Range (GDD: 25 m; fog 20 m).</param>
        public static float Score(float bearing, float distance, float coneHalfAngle, float range)
        {
            float angle = Math.Abs(bearing);
            if (!(range > 0f) || !(coneHalfAngle > 0f) || angle > coneHalfAngle || distance > range || distance < 0f)
            {
                return -1f;
            }

            return AngleWeight * (angle / coneHalfAngle) + DistanceWeight * (distance / range);
        }

        /// <summary>
        /// Index of the best candidate for the first lock-on, or −1. Candidates are given as parallel arrays.
        /// </summary>
        /// <param name="bearings">Signed angles to the camera direction.</param>
        /// <param name="distances">Distances.</param>
        /// <param name="count">Number of valid entries.</param>
        /// <param name="coneHalfAngle">Half angle of the cone.</param>
        /// <param name="range">Range.</param>
        public static int SelectBest(float[] bearings, float[] distances, int count, float coneHalfAngle, float range)
        {
            int best = -1;
            float bestScore = float.MaxValue;
            for (int i = 0; i < count; i++)
            {
                float score = Score(bearings[i], distances[i], coneHalfAngle, range);
                if (score >= 0f && score < bestScore)
                {
                    best = i;
                    bestScore = score;
                }
            }

            return best;
        }

        /// <summary>
        /// Index of the candidate to switch to: the smallest bearing step from the current target in the requested
        /// direction (positive = right, negative = left), or −1 if there is none on that side.
        /// </summary>
        /// <param name="currentBearing">Bearing of the current target (seen from the player or camera).</param>
        /// <param name="bearings">Bearings of the candidates (the current target may be included; it is skipped).</param>
        /// <param name="count">Number of valid entries.</param>
        /// <param name="direction">Direction of the flick: &gt; 0 right, &lt; 0 left.</param>
        public static int SelectSwitch(float currentBearing, float[] bearings, int count, float direction)
        {
            if (direction == 0f)
            {
                return -1;
            }

            int best = -1;
            float bestStep = float.MaxValue;
            for (int i = 0; i < count; i++)
            {
                float step = CombatMath.DeltaAngle(currentBearing, bearings[i]);
                if (direction > 0f ? step > 0.5f : step < -0.5f)
                {
                    float size = Math.Abs(step);
                    if (size < bestStep)
                    {
                        best = i;
                        bestStep = size;
                    }
                }
            }

            return best;
        }

        /// <summary>
        /// Camera distance in lock-on (GDD 03 2.1): 4.5 + 0.25 × target height + 0.1 × distance, clamped to 4.5–7.0 m.
        /// </summary>
        /// <param name="targetHeight">Height of the target in metres.</param>
        /// <param name="distance">Distance between player and target in metres.</param>
        public static float LockOnCameraDistance(float targetHeight, float distance)
        {
            float value = 4.5f + 0.25f * Math.Max(0f, targetHeight) + 0.1f * Math.Max(0f, distance);
            return Math.Max(4.5f, Math.Min(7f, value));
        }
    }
}
