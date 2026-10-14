using System;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Geometry of the arena beam (GDD 02 11.7, phase 2): the arena mirror sends the Aether beam along its facing; a target is
    /// hit when it stands in front of the mirror within the beam radius. A mirror that faces back to the light source blocks
    /// the beam. Walls and pillars are checked by the controller with a line cast. Pure logic on the ground plane.
    /// </summary>
    public static class BossBeamMath
    {
        /// <summary>Default half width of the beam including the body radius (metres).</summary>
        public const float DefaultRadius = 0.9f;

        /// <summary>True if the target is inside the beam.</summary>
        /// <param name="originX">Mirror X.</param>
        /// <param name="originZ">Mirror Z.</param>
        /// <param name="directionX">Beam direction X (need not be normalised).</param>
        /// <param name="directionZ">Beam direction Z.</param>
        /// <param name="targetX">Target X.</param>
        /// <param name="targetZ">Target Z.</param>
        /// <param name="radius">Half width (beam plus body).</param>
        /// <param name="maxDistance">Length of the beam.</param>
        public static bool IsInBeam(float originX, float originZ, float directionX, float directionZ, float targetX, float targetZ, float radius,
            float maxDistance)
        {
            float length = (float)Math.Sqrt(directionX * directionX + directionZ * directionZ);
            if (!(length > 1e-5f) || !(radius > 0f) || !(maxDistance > 0f))
            {
                return false;
            }

            float dx = directionX / length;
            float dz = directionZ / length;
            float tx = targetX - originX;
            float tz = targetZ - originZ;
            float along = tx * dx + tz * dz;
            if (along <= 0f || along > maxDistance)
            {
                return false;
            }

            float lateral = Math.Abs(tx * dz - tz * dx);
            return lateral <= radius;
        }

        /// <summary>True if the mirror sends the beam back towards its light source (then the beam ends at the mirror).</summary>
        /// <param name="mirrorX">Mirror X.</param>
        /// <param name="mirrorZ">Mirror Z.</param>
        /// <param name="directionX">Mirror facing X.</param>
        /// <param name="directionZ">Mirror facing Z.</param>
        /// <param name="sourceX">Light source X.</param>
        /// <param name="sourceZ">Light source Z.</param>
        public static bool FacesSource(float mirrorX, float mirrorZ, float directionX, float directionZ, float sourceX, float sourceZ)
        {
            float sx = sourceX - mirrorX;
            float sz = sourceZ - mirrorZ;
            float lengthSource = (float)Math.Sqrt(sx * sx + sz * sz);
            float lengthDirection = (float)Math.Sqrt(directionX * directionX + directionZ * directionZ);
            if (!(lengthSource > 1e-5f) || !(lengthDirection > 1e-5f))
            {
                return false;
            }

            return (sx * directionX + sz * directionZ) / (lengthSource * lengthDirection) > 0.7f;
        }
    }
}
