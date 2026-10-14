using System;

namespace Aetherfall.World
{
    /// <summary>3D vector in double precision for pure mesh building (Unity axes: x right, y up, z forward).</summary>
    public readonly struct GeometryVector
    {
        /// <summary>Creates a vector.</summary>
        /// <param name="x">x.</param>
        /// <param name="y">y.</param>
        /// <param name="z">z.</param>
        public GeometryVector(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        /// <summary>x.</summary>
        public double X { get; }

        /// <summary>y.</summary>
        public double Y { get; }

        /// <summary>z.</summary>
        public double Z { get; }

        /// <summary>Length.</summary>
        public double Length => Math.Sqrt(X * X + Y * Y + Z * Z);

        /// <summary>Sum.</summary>
        /// <param name="a">a.</param>
        /// <param name="b">b.</param>
        public static GeometryVector operator +(GeometryVector a, GeometryVector b)
        {
            return new GeometryVector(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        }

        /// <summary>Difference.</summary>
        /// <param name="a">a.</param>
        /// <param name="b">b.</param>
        public static GeometryVector operator -(GeometryVector a, GeometryVector b)
        {
            return new GeometryVector(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        }

        /// <summary>Scaled vector.</summary>
        /// <param name="a">Vector.</param>
        /// <param name="s">Factor.</param>
        public static GeometryVector operator *(GeometryVector a, double s)
        {
            return new GeometryVector(a.X * s, a.Y * s, a.Z * s);
        }

        /// <summary>Dot product.</summary>
        /// <param name="a">a.</param>
        /// <param name="b">b.</param>
        public static double Dot(GeometryVector a, GeometryVector b)
        {
            return a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        }

        /// <summary>Cross product (Unity: the front side of triangle a, b, c faces along Cross(b − a, c − a)).</summary>
        /// <param name="a">a.</param>
        /// <param name="b">b.</param>
        public static GeometryVector Cross(GeometryVector a, GeometryVector b)
        {
            return new GeometryVector(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
        }
    }
}
