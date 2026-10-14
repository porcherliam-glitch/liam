using System;
using System.Globalization;

namespace Aetherfall.World
{
    /// <summary>Point on the ground plane of a layout in metres: <see cref="X"/> = east, <see cref="Z"/> = north.</summary>
    public readonly struct LayoutPoint : IEquatable<LayoutPoint>
    {
        /// <summary>Creates a point.</summary>
        /// <param name="x">East coordinate in metres.</param>
        /// <param name="z">North coordinate in metres.</param>
        public LayoutPoint(double x, double z)
        {
            X = x;
            Z = z;
        }

        /// <summary>East coordinate in metres.</summary>
        public double X { get; }

        /// <summary>North coordinate in metres.</summary>
        public double Z { get; }

        /// <summary>Distance to another point.</summary>
        /// <param name="other">Other point.</param>
        public double DistanceTo(LayoutPoint other)
        {
            double dx = other.X - X;
            double dz = other.Z - Z;
            return Math.Sqrt(dx * dx + dz * dz);
        }

        /// <inheritdoc />
        public bool Equals(LayoutPoint other)
        {
            return X.Equals(other.X) && Z.Equals(other.Z);
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is LayoutPoint other && Equals(other);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            unchecked
            {
                return (X.GetHashCode() * 397) ^ Z.GetHashCode();
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "(" + X.ToString("0.##", CultureInfo.InvariantCulture) + " | " + Z.ToString("0.##", CultureInfo.InvariantCulture) + ")";
        }
    }
}
