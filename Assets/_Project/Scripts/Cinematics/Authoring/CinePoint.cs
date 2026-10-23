using System;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// A point or direction in world metres for cutscene and dialogue camera arithmetic (pure, without engine types, so the rules
    /// run in plain .NET tests too).
    /// </summary>
    public readonly struct CinePoint
    {
        /// <summary>The origin.</summary>
        public static readonly CinePoint Zero = new CinePoint(0d, 0d, 0d);

        /// <summary>World up.</summary>
        public static readonly CinePoint Up = new CinePoint(0d, 1d, 0d);

        /// <summary>Creates a point.</summary>
        /// <param name="x">X (east).</param>
        /// <param name="y">Y (up).</param>
        /// <param name="z">Z (north).</param>
        public CinePoint(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        /// <summary>X (east).</summary>
        public double X { get; }

        /// <summary>Y (up).</summary>
        public double Y { get; }

        /// <summary>Z (north).</summary>
        public double Z { get; }

        /// <summary>Length.</summary>
        public double Length => Math.Sqrt(X * X + Y * Y + Z * Z);

        /// <summary>Same direction with length 1 (zero stays zero).</summary>
        public CinePoint Normalized
        {
            get
            {
                double length = Length;
                return length > 1e-9 ? new CinePoint(X / length, Y / length, Z / length) : Zero;
            }
        }

        /// <summary>The same point without height (y = 0).</summary>
        public CinePoint Flat => new CinePoint(X, 0d, Z);

        /// <summary>Sum.</summary>
        public static CinePoint operator +(CinePoint a, CinePoint b)
        {
            return new CinePoint(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        }

        /// <summary>Difference.</summary>
        public static CinePoint operator -(CinePoint a, CinePoint b)
        {
            return new CinePoint(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        }

        /// <summary>Scaled.</summary>
        public static CinePoint operator *(CinePoint a, double factor)
        {
            return new CinePoint(a.X * factor, a.Y * factor, a.Z * factor);
        }

        /// <summary>Scaled.</summary>
        public static CinePoint operator *(double factor, CinePoint a)
        {
            return a * factor;
        }

        /// <summary>Linear blend from a to b.</summary>
        /// <param name="a">Start.</param>
        /// <param name="b">End.</param>
        /// <param name="t">0 … 1.</param>
        public static CinePoint Lerp(CinePoint a, CinePoint b, double t)
        {
            return a + (b - a) * t;
        }

        /// <summary>Dot product.</summary>
        /// <param name="a">First.</param>
        /// <param name="b">Second.</param>
        public static double Dot(CinePoint a, CinePoint b)
        {
            return a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        }

        /// <summary>Cross product.</summary>
        /// <param name="a">First.</param>
        /// <param name="b">Second.</param>
        public static CinePoint Cross(CinePoint a, CinePoint b)
        {
            return new CinePoint(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
        }

        /// <summary>Distance between two points.</summary>
        /// <param name="a">First.</param>
        /// <param name="b">Second.</param>
        public static double Distance(CinePoint a, CinePoint b)
        {
            return (a - b).Length;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "(" + X.ToString("0.0") + ", " + Y.ToString("0.0") + ", " + Z.ToString("0.0") + ")";
        }
    }

    /// <summary>Where a camera stands and what it looks at, with its field of view and tilt (Dutch angle).</summary>
    public readonly struct CinePose
    {
        /// <summary>Creates a pose.</summary>
        /// <param name="position">Camera position.</param>
        /// <param name="lookAt">Point it looks at.</param>
        /// <param name="fieldOfView">Vertical field of view in degrees.</param>
        /// <param name="dutch">Tilt in degrees (0 = level).</param>
        public CinePose(CinePoint position, CinePoint lookAt, double fieldOfView, double dutch = 0d)
        {
            Position = position;
            LookAt = lookAt;
            FieldOfView = fieldOfView;
            Dutch = dutch;
        }

        /// <summary>Camera position.</summary>
        public CinePoint Position { get; }

        /// <summary>Point it looks at.</summary>
        public CinePoint LookAt { get; }

        /// <summary>Vertical field of view in degrees.</summary>
        public double FieldOfView { get; }

        /// <summary>Tilt in degrees.</summary>
        public double Dutch { get; }

        /// <summary>The same pose a little higher (another camera position when the view is blocked).</summary>
        /// <param name="metres">Metres up.</param>
        public CinePose Raised(double metres)
        {
            return new CinePose(Position + CinePoint.Up * metres, LookAt, FieldOfView, Dutch);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Position + " → " + LookAt + ", FOV " + FieldOfView.ToString("0");
        }
    }
}
