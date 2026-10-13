using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Planar angle math of combat and AI (Y up, yaw 0 = +Z, positive yaw turns right, like Unity). Pure logic with floats
    /// and <see cref="Math"/>, so targeting, blocking angles and perception are testable outside of Unity.
    /// </summary>
    public static class CombatMath
    {
        /// <summary>Normalizes an angle to [0, 360).</summary>
        /// <param name="angle">Degrees.</param>
        public static float NormalizeAngle(float angle)
        {
            float result = angle % 360f;
            if (result < 0f)
            {
                result += 360f;
            }

            return result >= 360f ? result - 360f : result;
        }

        /// <summary>Shortest signed difference from <paramref name="current"/> to <paramref name="target"/>, in (−180, 180].</summary>
        /// <param name="current">Current angle.</param>
        /// <param name="target">Target angle.</param>
        public static float DeltaAngle(float current, float target)
        {
            float delta = NormalizeAngle(target - current);
            return delta > 180f ? delta - 360f : delta;
        }

        /// <summary>Yaw in degrees [0, 360) of a direction on the XZ plane.</summary>
        /// <param name="x">X component.</param>
        /// <param name="z">Z component.</param>
        public static float YawOf(float x, float z)
        {
            return NormalizeAngle((float)(Math.Atan2(x, z) * (180.0 / Math.PI)));
        }

        /// <summary>Horizontal distance between two points.</summary>
        /// <param name="ax">X of A.</param>
        /// <param name="az">Z of A.</param>
        /// <param name="bx">X of B.</param>
        /// <param name="bz">Z of B.</param>
        public static float PlanarDistance(float ax, float az, float bx, float bz)
        {
            float dx = bx - ax;
            float dz = bz - az;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        /// <summary>
        /// Signed horizontal angle between the facing of a viewer and the direction to a point (0 = straight ahead, positive =
        /// to the right). 0 if the point lies on the viewer.
        /// </summary>
        /// <param name="viewerX">X of the viewer.</param>
        /// <param name="viewerZ">Z of the viewer.</param>
        /// <param name="viewerYaw">Facing of the viewer in degrees.</param>
        /// <param name="pointX">X of the point.</param>
        /// <param name="pointZ">Z of the point.</param>
        public static float BearingTo(float viewerX, float viewerZ, float viewerYaw, float pointX, float pointZ)
        {
            float dx = pointX - viewerX;
            float dz = pointZ - viewerZ;
            if (dx * dx + dz * dz < 1e-8f)
            {
                return 0f;
            }

            return DeltaAngle(viewerYaw, YawOf(dx, dz));
        }

        /// <summary>Turns an angle towards a target by at most <paramref name="maxDelta"/> degrees.</summary>
        /// <param name="current">Current angle.</param>
        /// <param name="target">Target angle.</param>
        /// <param name="maxDelta">Largest change (≥ 0).</param>
        public static float MoveTowardsAngle(float current, float target, float maxDelta)
        {
            float delta = DeltaAngle(current, target);
            if (Math.Abs(delta) <= maxDelta)
            {
                return NormalizeAngle(target);
            }

            return NormalizeAngle(current + Math.Sign(delta) * maxDelta);
        }

        /// <summary>Limits a turn from <paramref name="current"/> towards <paramref name="target"/> to ±<paramref name="maxTurn"/> degrees.</summary>
        /// <param name="current">Current yaw.</param>
        /// <param name="target">Wanted yaw.</param>
        /// <param name="maxTurn">Largest allowed turn.</param>
        public static float ClampTurn(float current, float target, float maxTurn)
        {
            return MoveTowardsAngle(current, target, Math.Max(0f, maxTurn));
        }
    }
}
