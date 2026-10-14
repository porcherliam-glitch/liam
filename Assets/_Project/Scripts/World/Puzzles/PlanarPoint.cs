using System;
using System.Globalization;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Point on the ground plane (x = east, z = north) for the pure puzzle logic, so beams and positions are computed and
    /// tested without UnityEngine types. Immutable value type.
    /// </summary>
    public readonly struct PlanarPoint
    {
        /// <summary>Creates the point.</summary>
        /// <param name="x">X (east).</param>
        /// <param name="z">Z (north).</param>
        public PlanarPoint(float x, float z)
        {
            X = x;
            Z = z;
        }

        /// <summary>X (east).</summary>
        public float X { get; }

        /// <summary>Z (north).</summary>
        public float Z { get; }

        /// <summary>Distance to another point.</summary>
        /// <param name="other">Other point.</param>
        public float DistanceTo(PlanarPoint other)
        {
            float dx = other.X - X;
            float dz = other.Z - Z;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        /// <summary>The point moved by a distance in a direction.</summary>
        /// <param name="direction">Direction.</param>
        /// <param name="distance">Distance in metres.</param>
        public PlanarPoint Step(GridDirection direction, float distance)
        {
            return new PlanarPoint(X + GridDirections.StepX(direction) * distance, Z + GridDirections.StepZ(direction) * distance);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "(" + X.ToString("0.##", CultureInfo.InvariantCulture) + " | " + Z.ToString("0.##", CultureInfo.InvariantCulture) + ")";
        }
    }
}
