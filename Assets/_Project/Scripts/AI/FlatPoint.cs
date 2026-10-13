using System;

namespace Aetherfall.AI
{
    /// <summary>
    /// Point on the ground plane (X/Z) for the pure AI logic (<see cref="EnemyBrain"/>), so the brain has no UnityEngine
    /// types and runs (and is tested) outside of Unity. Immutable value type.
    /// </summary>
    public readonly struct FlatPoint
    {
        /// <summary>Creates the point.</summary>
        /// <param name="x">X (right).</param>
        /// <param name="z">Z (forward).</param>
        public FlatPoint(float x, float z)
        {
            X = x;
            Z = z;
        }

        /// <summary>X.</summary>
        public float X { get; }

        /// <summary>Z.</summary>
        public float Z { get; }

        /// <summary>Distance to another point.</summary>
        /// <param name="other">Other point.</param>
        public float DistanceTo(FlatPoint other)
        {
            float dx = other.X - X;
            float dz = other.Z - Z;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "(" + X.ToString("0.##") + ", " + Z.ToString("0.##") + ")";
        }
    }
}
