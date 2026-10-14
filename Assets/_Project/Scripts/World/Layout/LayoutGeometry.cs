using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Plane geometry of layouts (pure logic, double precision). Rotation convention as in Unity: yaw in degrees clockwise seen
    /// from above, 0 = north; local +z = front, local +x = right. The Python twin is Tools/Preview/eichental_layout.py.
    /// </summary>
    public static class LayoutGeometry
    {
        /// <summary>Hermite smoothstep on [0, 1]; clamps the input.</summary>
        /// <param name="t">Input.</param>
        public static double SmoothStep01(double t)
        {
            if (t <= 0.0)
            {
                return 0.0;
            }

            if (t >= 1.0)
            {
                return 1.0;
            }

            return t * t * (3.0 - 2.0 * t);
        }

        /// <summary>Linear interpolation.</summary>
        /// <param name="a">Start.</param>
        /// <param name="b">End.</param>
        /// <param name="t">Fraction.</param>
        public static double Lerp(double a, double b, double t)
        {
            return a + (b - a) * t;
        }

        /// <summary>Degrees to radians.</summary>
        /// <param name="degrees">Angle in degrees.</param>
        public static double Radians(double degrees)
        {
            return degrees * Math.PI / 180.0;
        }

        /// <summary>Turns a local offset (x right, z front) into a world offset for a yaw.</summary>
        /// <param name="localX">Local x.</param>
        /// <param name="localZ">Local z.</param>
        /// <param name="yawDegrees">Yaw in degrees.</param>
        public static LayoutPoint RotateLocal(double localX, double localZ, double yawDegrees)
        {
            double a = Radians(yawDegrees);
            double c = Math.Cos(a);
            double s = Math.Sin(a);
            return new LayoutPoint(localX * c + localZ * s, -localX * s + localZ * c);
        }

        /// <summary>Turns a world offset into local coordinates (inverse of <see cref="RotateLocal"/>).</summary>
        /// <param name="dx">World offset east.</param>
        /// <param name="dz">World offset north.</param>
        /// <param name="yawDegrees">Yaw in degrees.</param>
        public static LayoutPoint ToLocal(double dx, double dz, double yawDegrees)
        {
            double a = Radians(yawDegrees);
            double c = Math.Cos(a);
            double s = Math.Sin(a);
            return new LayoutPoint(dx * c - dz * s, dx * s + dz * c);
        }

        /// <summary>Distance from a point to a segment and the fraction of the closest point along the segment.</summary>
        /// <param name="px">Point x.</param>
        /// <param name="pz">Point z.</param>
        /// <param name="a">Segment start.</param>
        /// <param name="b">Segment end.</param>
        /// <param name="fraction">Fraction 0..1 of the closest point.</param>
        public static double SegmentDistance(double px, double pz, LayoutPoint a, LayoutPoint b, out double fraction)
        {
            double dx = b.X - a.X;
            double dz = b.Z - a.Z;
            double length2 = dx * dx + dz * dz;
            if (length2 <= 1e-12)
            {
                fraction = 0.0;
                return Hypot(px - a.X, pz - a.Z);
            }

            double f = ((px - a.X) * dx + (pz - a.Z) * dz) / length2;
            if (f < 0.0)
            {
                f = 0.0;
            }
            else if (f > 1.0)
            {
                f = 1.0;
            }

            fraction = f;
            return Hypot(px - (a.X + dx * f), pz - (a.Z + dz * f));
        }

        /// <summary>Closest point on an open polyline; the first segment wins ties.</summary>
        /// <param name="px">Point x.</param>
        /// <param name="pz">Point z.</param>
        /// <param name="points">Polyline points.</param>
        public static PolylineHit Nearest(double px, double pz, IReadOnlyList<LayoutPoint> points)
        {
            double best = double.PositiveInfinity;
            int segment = 0;
            double fraction = 0.0;
            if (points == null)
            {
                return new PolylineHit(best, 0, 0.0);
            }

            for (int i = 0; i < points.Count - 1; i++)
            {
                double d = SegmentDistance(px, pz, points[i], points[i + 1], out double f);
                if (d < best)
                {
                    best = d;
                    segment = i;
                    fraction = f;
                }
            }

            return new PolylineHit(best, segment, fraction);
        }

        /// <summary>Distance to a closed polygon outline (the last point connects to the first).</summary>
        /// <param name="px">Point x.</param>
        /// <param name="pz">Point z.</param>
        /// <param name="points">Polygon points.</param>
        public static double ClosedOutlineDistance(double px, double pz, IReadOnlyList<LayoutPoint> points)
        {
            double best = Nearest(px, pz, points).Distance;
            if (points != null && points.Count > 2)
            {
                best = Math.Min(best, SegmentDistance(px, pz, points[points.Count - 1], points[0], out _));
            }

            return best;
        }

        /// <summary>Point in polygon by the even-odd rule (points exactly on an edge may go either way).</summary>
        /// <param name="px">Point x.</param>
        /// <param name="pz">Point z.</param>
        /// <param name="polygon">Polygon points.</param>
        public static bool InPolygon(double px, double pz, IReadOnlyList<LayoutPoint> polygon)
        {
            if (polygon == null || polygon.Count < 3)
            {
                return false;
            }

            bool inside = false;
            int j = polygon.Count - 1;
            for (int i = 0; i < polygon.Count; i++)
            {
                double xi = polygon[i].X;
                double zi = polygon[i].Z;
                double xj = polygon[j].X;
                double zj = polygon[j].Z;
                if ((zi > pz) != (zj > pz))
                {
                    double xCross = xi + (pz - zi) * (xj - xi) / (zj - zi);
                    if (px < xCross)
                    {
                        inside = !inside;
                    }
                }

                j = i;
            }

            return inside;
        }

        /// <summary>
        /// How far a point lies outside a rotated rectangle: max(|lx| − width/2, |lz| − depth/2). Negative inside.
        /// </summary>
        /// <param name="px">Point x.</param>
        /// <param name="pz">Point z.</param>
        /// <param name="center">Rectangle centre.</param>
        /// <param name="width">Size along local x.</param>
        /// <param name="depth">Size along local z.</param>
        /// <param name="yawDegrees">Rotation.</param>
        public static double RectExcess(double px, double pz, LayoutPoint center, double width, double depth, double yawDegrees)
        {
            LayoutPoint local = ToLocal(px - center.X, pz - center.Z, yawDegrees);
            return Math.Max(Math.Abs(local.X) - width * 0.5, Math.Abs(local.Z) - depth * 0.5);
        }

        /// <summary>Corners of a rotated rectangle (counter-clockwise from the back left seen from above).</summary>
        /// <param name="center">Centre.</param>
        /// <param name="width">Size along local x.</param>
        /// <param name="depth">Size along local z.</param>
        /// <param name="yawDegrees">Rotation.</param>
        /// <param name="margin">Extra distance on every side.</param>
        public static LayoutPoint[] RectCorners(LayoutPoint center, double width, double depth, double yawDegrees, double margin = 0.0)
        {
            double hw = width * 0.5 + margin;
            double hd = depth * 0.5 + margin;
            double[] xs = { -hw, hw, hw, -hw };
            double[] zs = { -hd, -hd, hd, hd };
            var corners = new LayoutPoint[4];
            for (int i = 0; i < 4; i++)
            {
                LayoutPoint offset = RotateLocal(xs[i], zs[i], yawDegrees);
                corners[i] = new LayoutPoint(center.X + offset.X, center.Z + offset.Z);
            }

            return corners;
        }

        /// <summary>True if two convex polygons overlap (separating axis test; touching edges do not count).</summary>
        /// <param name="a">First polygon.</param>
        /// <param name="b">Second polygon.</param>
        public static bool ConvexOverlap(IReadOnlyList<LayoutPoint> a, IReadOnlyList<LayoutPoint> b)
        {
            return !HasSeparatingAxis(a, b) && !HasSeparatingAxis(b, a);
        }

        /// <summary>sqrt(x² + z²).</summary>
        /// <param name="x">x.</param>
        /// <param name="z">z.</param>
        public static double Hypot(double x, double z)
        {
            return Math.Sqrt(x * x + z * z);
        }

        /// <summary>Length of a polyline.</summary>
        /// <param name="points">Points.</param>
        public static double PolylineLength(IReadOnlyList<LayoutPoint> points)
        {
            double length = 0.0;
            for (int i = 0; points != null && i < points.Count - 1; i++)
            {
                length += points[i].DistanceTo(points[i + 1]);
            }

            return length;
        }

        private static bool HasSeparatingAxis(IReadOnlyList<LayoutPoint> a, IReadOnlyList<LayoutPoint> b)
        {
            for (int i = 0; i < a.Count; i++)
            {
                LayoutPoint p0 = a[i];
                LayoutPoint p1 = a[(i + 1) % a.Count];
                double nx = -(p1.Z - p0.Z);
                double nz = p1.X - p0.X;
                Project(a, nx, nz, out double minA, out double maxA);
                Project(b, nx, nz, out double minB, out double maxB);
                if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9)
                {
                    return true;
                }
            }

            return false;
        }

        private static void Project(IReadOnlyList<LayoutPoint> polygon, double nx, double nz, out double min, out double max)
        {
            min = double.PositiveInfinity;
            max = double.NegativeInfinity;
            for (int i = 0; i < polygon.Count; i++)
            {
                double v = polygon[i].X * nx + polygon[i].Z * nz;
                min = Math.Min(min, v);
                max = Math.Max(max, v);
            }
        }
    }
}
