using System;

namespace Aetherfall.Player
{
    /// <summary>
    /// Float math of the player movement: camera-relative direction, jump speed, slope angle, angle helpers. Pure logic
    /// with <see cref="MotionVector"/> and <see cref="Math"/> (no UnityEngine calls, testable outside of Unity).
    /// </summary>
    public static class PlayerMovementMath
    {
        /// <summary>Input magnitudes up to this value count as "no input".</summary>
        public const float InputEpsilon = 0.001f;

        /// <summary>
        /// Converts movement input into a world direction on the XZ plane relative to the camera yaw. The length equals the
        /// input magnitude, clamped to 1 (Y of the result is 0).
        /// </summary>
        /// <param name="inputX">Stick/WASD input to the right.</param>
        /// <param name="inputY">Stick/WASD input forward.</param>
        /// <param name="cameraYawDegrees">Camera yaw in degrees (0 = +Z).</param>
        public static MotionVector CameraRelativeDirection(float inputX, float inputY, float cameraYawDegrees)
        {
            float x = inputX;
            float y = inputY;
            float length = (float)Math.Sqrt(x * x + y * y);
            if (length > 1f)
            {
                x /= length;
                y /= length;
            }

            double radians = cameraYawDegrees * (Math.PI / 180.0);
            float sin = (float)Math.Sin(radians);
            float cos = (float)Math.Cos(radians);

            // forward = (sin, cos), right = (cos, -sin) on the XZ plane.
            return new MotionVector(x * cos + y * sin, 0f, -x * sin + y * cos);
        }

        /// <summary>Upward start speed that reaches <paramref name="height"/> under constant gravity: v = √(2·g·h).</summary>
        /// <param name="height">Jump height in m (≥ 0).</param>
        /// <param name="gravity">Gravity while rising in m/s² (&gt; 0).</param>
        public static float JumpVelocity(float height, float gravity)
        {
            if (!(height > 0f) || !(gravity > 0f))
            {
                return 0f;
            }

            return (float)Math.Sqrt(2.0 * gravity * height);
        }

        /// <summary>Angle between a surface normal and world up, in degrees (0 = flat, 90 = wall).</summary>
        /// <param name="normal">Surface normal (need not be normalized).</param>
        public static float SlopeAngle(MotionVector normal)
        {
            double length = Math.Sqrt(normal.X * normal.X + normal.Y * normal.Y + normal.Z * normal.Z);
            if (length < 1e-6)
            {
                return 90f;
            }

            double cos = Math.Max(-1.0, Math.Min(1.0, normal.Y / length));
            return (float)(Math.Acos(cos) * (180.0 / Math.PI));
        }

        /// <summary>Turns an angle towards a target by at most <paramref name="maxDelta"/> degrees along the shorter way.</summary>
        /// <param name="current">Current angle in degrees.</param>
        /// <param name="target">Target angle in degrees.</param>
        /// <param name="maxDelta">Largest allowed change in degrees (≥ 0).</param>
        /// <returns>The new angle, normalized to [0, 360).</returns>
        public static float MoveTowardsAngle(float current, float target, float maxDelta)
        {
            float delta = DeltaAngle(current, target);
            if (Math.Abs(delta) <= maxDelta)
            {
                return NormalizeAngle(target);
            }

            return NormalizeAngle(current + Math.Sign(delta) * maxDelta);
        }

        /// <summary>Shortest signed difference from <paramref name="current"/> to <paramref name="target"/> in degrees (−180, 180].</summary>
        /// <param name="current">Current angle.</param>
        /// <param name="target">Target angle.</param>
        public static float DeltaAngle(float current, float target)
        {
            float delta = NormalizeAngle(target - current);
            return delta > 180f ? delta - 360f : delta;
        }

        /// <summary>Yaw in degrees [0, 360) of a direction on the XZ plane (0 = +Z, 90 = +X).</summary>
        /// <param name="x">X component.</param>
        /// <param name="z">Z component.</param>
        public static float YawOf(float x, float z)
        {
            return NormalizeAngle((float)(Math.Atan2(x, z) * (180.0 / Math.PI)));
        }

        /// <summary>Normalizes an angle to [0, 360).</summary>
        /// <param name="angle">Angle in degrees.</param>
        public static float NormalizeAngle(float angle)
        {
            float result = angle % 360f;
            if (result < 0f)
            {
                result += 360f;
            }

            return result >= 360f ? result - 360f : result;
        }

        /// <summary>Clamps a value to [0, 1].</summary>
        /// <param name="value">Value.</param>
        public static float Clamp01(float value)
        {
            return value < 0f ? 0f : value > 1f ? 1f : value;
        }
    }
}
