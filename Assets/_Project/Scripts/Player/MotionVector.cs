using System;

namespace Aetherfall.Player
{
    /// <summary>
    /// Plain 3D vector of the pure movement code (<see cref="PlayerMovementModel"/>, <see cref="PlayerMovementMath"/>).
    /// Used instead of <c>UnityEngine.Vector3</c> so that the model makes no UnityEngine calls at all and runs (and is
    /// tested) outside of Unity; <see cref="PlayerMotor"/> converts at the boundary.
    /// </summary>
    public readonly struct MotionVector : IEquatable<MotionVector>
    {
        /// <summary>Creates the vector.</summary>
        /// <param name="x">X component (right).</param>
        /// <param name="y">Y component (up).</param>
        /// <param name="z">Z component (forward).</param>
        public MotionVector(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        /// <summary>(0, 0, 0).</summary>
        public static MotionVector Zero => new MotionVector(0f, 0f, 0f);

        /// <summary>(0, 1, 0).</summary>
        public static MotionVector Up => new MotionVector(0f, 1f, 0f);

        /// <summary>X component (right).</summary>
        public float X { get; }

        /// <summary>Y component (up).</summary>
        public float Y { get; }

        /// <summary>Z component (forward).</summary>
        public float Z { get; }

        /// <summary>Length of the vector.</summary>
        public float Magnitude => (float)Math.Sqrt(X * X + Y * Y + Z * Z);

        /// <summary>Length of the XZ part (horizontal speed of a velocity).</summary>
        public float HorizontalMagnitude => (float)Math.Sqrt(X * X + Z * Z);

        /// <inheritdoc />
        public bool Equals(MotionVector other)
        {
            return X.Equals(other.X) && Y.Equals(other.Y) && Z.Equals(other.Z);
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is MotionVector other && Equals(other);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            unchecked
            {
                int hash = X.GetHashCode();
                hash = (hash * 397) ^ Y.GetHashCode();
                return (hash * 397) ^ Z.GetHashCode();
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "(" + X.ToString("0.###") + ", " + Y.ToString("0.###") + ", " + Z.ToString("0.###") + ")";
        }
    }
}
