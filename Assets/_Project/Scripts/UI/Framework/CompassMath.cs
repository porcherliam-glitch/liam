using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Compass strip of the HUD (GDD 05 1.8: ±90° field of view, cardinal directions). North is world +Z, east is world +X.
    /// Pure logic.
    /// </summary>
    public static class CompassMath
    {
        /// <summary>Visible field of the strip in degrees (±90°).</summary>
        public const float DefaultFieldOfView = 180f;

        /// <summary>Bearing of the eight compass labels N, NO, O, SO, S, SW, W, NW (degrees).</summary>
        public static readonly float[] CardinalBearings = { 0f, 45f, 90f, 135f, 180f, 225f, 270f, 315f };

        /// <summary>Signed difference from <paramref name="from"/> to <paramref name="to"/> in degrees, in (-180, 180].</summary>
        /// <param name="from">Angle in degrees.</param>
        /// <param name="to">Angle in degrees.</param>
        public static float DeltaAngle(float from, float to)
        {
            double delta = (to - from) % 360d;
            if (delta <= -180d)
            {
                delta += 360d;
            }
            else if (delta > 180d)
            {
                delta -= 360d;
            }

            return (float)delta;
        }

        /// <summary>Heading in degrees (0 = north/+Z, 90 = east/+X) of a horizontal direction.</summary>
        /// <param name="x">X component.</param>
        /// <param name="z">Z component.</param>
        public static float HeadingOf(float x, float z)
        {
            if (x == 0f && z == 0f)
            {
                return 0f;
            }

            double degrees = Math.Atan2(x, z) * 180d / Math.PI;
            return (float)(degrees < 0d ? degrees + 360d : degrees);
        }

        /// <summary>Position of a marker on the strip (0 = left edge, 0.5 = centre, 1 = right edge).</summary>
        /// <param name="markerBearing">Bearing of the marker in degrees.</param>
        /// <param name="heading">Heading of the camera in degrees.</param>
        /// <param name="fieldOfView">Visible field in degrees.</param>
        /// <param name="position01">Position on the strip.</param>
        /// <returns>False if the marker is outside the visible field.</returns>
        public static bool TryGetStripPosition(float markerBearing, float heading, float fieldOfView, out float position01)
        {
            float fov = fieldOfView > 0f ? fieldOfView : DefaultFieldOfView;
            float delta = DeltaAngle(heading, markerBearing);
            position01 = 0.5f + delta / fov;
            return Math.Abs(delta) <= fov * 0.5f;
        }
    }
}
