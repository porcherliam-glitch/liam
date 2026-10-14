using System;
using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Follows an Aether beam over rotatable mirrors (GDD 01 6.7 "Spiegel und Licht", GDD 02 11.7): the beam runs straight in
    /// one of the four directions until it meets the next mirror or the target lying on its line (within
    /// <see cref="AlignmentTolerance"/>). A mirror sends it on in the direction it is turned to; a mirror turned back against
    /// the beam stops it. The beam ends at the target, at the bounds or after <see cref="MaxBounces"/> mirrors. Pure logic,
    /// deterministic; the light puzzle, the layout validator and the Blender preview use the same rules.
    /// </summary>
    public static class MirrorBeamTracer
    {
        /// <summary>A mirror or the target counts as "on the line" within this distance to the beam (metres).</summary>
        public const float AlignmentTolerance = 0.35f;

        /// <summary>Largest number of mirrors on one path (also protects against loops).</summary>
        public const int MaxBounces = 16;

        /// <summary>Length of the last beam piece if nothing stops it and no bounds are given.</summary>
        public const float DefaultMaxLength = 60f;

        /// <summary>Traces the beam.</summary>
        /// <param name="source">Start point.</param>
        /// <param name="direction">Start direction.</param>
        /// <param name="mirrors">Mirrors with their current directions.</param>
        /// <param name="target">Target point (the seal).</param>
        /// <param name="hasTarget">False to trace without a target (arena beam).</param>
        /// <param name="minX">Bounds west (the beam stops here); NaN = no bounds.</param>
        /// <param name="maxX">Bounds east.</param>
        /// <param name="minZ">Bounds south.</param>
        /// <param name="maxZ">Bounds north.</param>
        /// <returns>The trace.</returns>
        public static BeamTrace Trace(PlanarPoint source, GridDirection direction, IReadOnlyList<BeamMirror> mirrors, PlanarPoint target, bool hasTarget = true,
            float minX = float.NaN, float maxX = float.NaN, float minZ = float.NaN, float maxZ = float.NaN)
        {
            var trace = new BeamTrace();
            trace.AddPoint(source);
            PlanarPoint current = source;
            GridDirection heading = direction;
            int currentMirror = -1;
            var visited = new HashSet<int>();
            for (int bounce = 0; bounce <= MaxBounces; bounce++)
            {
                int next = FindNext(current, heading, mirrors, currentMirror, out float mirrorDistance);
                float targetDistance = hasTarget ? AlongRay(current, heading, target) : float.NaN;
                bool targetFirst = hasTarget && !float.IsNaN(targetDistance) && (next < 0 || targetDistance < mirrorDistance);
                if (targetFirst)
                {
                    trace.AddPoint(target);
                    trace.MarkHitTarget();
                    return trace;
                }

                if (next < 0)
                {
                    trace.AddPoint(EndPoint(current, heading, minX, maxX, minZ, maxZ));
                    return trace;
                }

                BeamMirror mirror = mirrors[next];
                trace.AddPoint(mirror.Position);
                trace.AddMirror(mirror.Id);
                if (mirror.Direction == GridDirections.Opposite(heading))
                {
                    trace.MarkBlocked(mirror.Id);
                    return trace;
                }

                int state = next * GridDirections.Count + (int)heading;
                if (!visited.Add(state))
                {
                    return trace;
                }

                current = mirror.Position;
                heading = mirror.Direction;
                currentMirror = next;
            }

            return trace;
        }

        /// <summary>Distance along the ray to a point that lies on the ray (within the tolerance), else NaN.</summary>
        /// <param name="origin">Ray origin.</param>
        /// <param name="direction">Ray direction.</param>
        /// <param name="point">Point.</param>
        public static float AlongRay(PlanarPoint origin, GridDirection direction, PlanarPoint point)
        {
            float dx = point.X - origin.X;
            float dz = point.Z - origin.Z;
            float along = dx * GridDirections.StepX(direction) + dz * GridDirections.StepZ(direction);
            float across = Math.Abs(dx * GridDirections.StepZ(direction) - dz * GridDirections.StepX(direction));
            if (along <= 1e-3f || across > AlignmentTolerance)
            {
                return float.NaN;
            }

            return along;
        }

        private static int FindNext(PlanarPoint origin, GridDirection direction, IReadOnlyList<BeamMirror> mirrors, int exclude, out float distance)
        {
            int best = -1;
            distance = float.MaxValue;
            if (mirrors == null)
            {
                return best;
            }

            for (int i = 0; i < mirrors.Count; i++)
            {
                if (i == exclude)
                {
                    continue;
                }

                float along = AlongRay(origin, direction, mirrors[i].Position);
                if (!float.IsNaN(along) && along < distance)
                {
                    distance = along;
                    best = i;
                }
            }

            return best;
        }

        private static PlanarPoint EndPoint(PlanarPoint origin, GridDirection direction, float minX, float maxX, float minZ, float maxZ)
        {
            float length = DefaultMaxLength;
            switch (direction)
            {
                case GridDirection.North:
                    if (!float.IsNaN(maxZ))
                    {
                        length = maxZ - origin.Z;
                    }

                    break;
                case GridDirection.South:
                    if (!float.IsNaN(minZ))
                    {
                        length = origin.Z - minZ;
                    }

                    break;
                case GridDirection.East:
                    if (!float.IsNaN(maxX))
                    {
                        length = maxX - origin.X;
                    }

                    break;
                default:
                    if (!float.IsNaN(minX))
                    {
                        length = origin.X - minX;
                    }

                    break;
            }

            return origin.Step(direction, Math.Max(0f, length));
        }
    }
}
