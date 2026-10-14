using System;

namespace Aetherfall.World
{
    /// <summary>
    /// Builds placeholder roofs as meshes (no ProBuilder needed). Local axes: x across the building, y up from the top of the
    /// walls (eaves at y = 0), z along the ridge; the walls span x = ±width/2 and z = ±depth/2. Submesh 0 = roof slabs (thatch,
    /// shingles), submesh 1 = the triangular gable walls (plaster). Every slab is a closed box, so a burned house can show a
    /// partial roof with <c>coverage</c> below 1.
    /// </summary>
    public static class RoofGeometry
    {
        /// <summary>Submesh of the roof slabs.</summary>
        public const int RoofSubmesh = 0;

        /// <summary>Submesh of the gable walls.</summary>
        public const int GableSubmesh = 1;

        /// <summary>Rise of a roof over the eaves for a pitch (gable: half width; lean-to: full width).</summary>
        /// <param name="kind">Roof kind.</param>
        /// <param name="width">Width of the building.</param>
        /// <param name="pitchDegrees">Pitch in degrees.</param>
        public static double Rise(RoofKind kind, double width, double pitchDegrees)
        {
            double run = kind == RoofKind.LeanTo ? width : width * 0.5;
            return kind == RoofKind.None ? 0.0 : run * Math.Tan(pitchDegrees * Math.PI / 180.0);
        }

        /// <summary>
        /// Gable roof (Satteldach): two slabs meeting at the ridge over x = 0, plus the gable triangles at z = ±depth/2.
        /// </summary>
        /// <param name="width">Wall width (x).</param>
        /// <param name="depth">Wall depth (z, ridge direction).</param>
        /// <param name="pitchDegrees">Roof pitch.</param>
        /// <param name="overhang">Overhang beyond the walls at the eaves and gable ends.</param>
        /// <param name="thickness">Slab thickness (vertical).</param>
        /// <param name="leftCoverage">Share 0..1 of the left slab (x &lt; 0) that exists, from the back (−z).</param>
        /// <param name="rightCoverage">Share 0..1 of the right slab that exists, from the front (+z).</param>
        /// <param name="gables">True to add the gable walls.</param>
        public static MeshBuffers Gable(double width, double depth, double pitchDegrees, double overhang, double thickness,
            double leftCoverage = 1.0, double rightCoverage = 1.0, bool gables = true)
        {
            Check(width, depth, pitchDegrees, overhang, thickness);
            double half = width * 0.5;
            double rise = Rise(RoofKind.Gable, width, pitchDegrees);
            double drop = overhang * rise / half;
            double z0 = -depth * 0.5 - overhang;
            double z1 = depth * 0.5 + overhang;
            var mesh = new MeshBuffers(2);
            double leftEnd = z0 + Clamp01(leftCoverage) * (z1 - z0);
            double rightStart = z1 - Clamp01(rightCoverage) * (z1 - z0);
            if (leftEnd > z0 + 1e-6)
            {
                Slab(mesh, -half - overhang, -drop, 0.0, rise, thickness, z0, leftEnd);
            }

            if (z1 > rightStart + 1e-6)
            {
                Slab(mesh, half + overhang, -drop, 0.0, rise, thickness, rightStart, z1);
            }

            if (gables)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    double z = side * depth * 0.5;
                    mesh.AddTriangle(GableSubmesh, new GeometryVector(-half, 0.0, z), new GeometryVector(half, 0.0, z),
                        new GeometryVector(0.0, rise - thickness, z), new GeometryVector(0.0, 0.0, side));
                }
            }

            return mesh;
        }

        /// <summary>Lean-to roof (Pultdach): one slab, high over x = −width/2, low over x = +width/2, with right-angled gables.</summary>
        /// <param name="width">Wall width (x).</param>
        /// <param name="depth">Wall depth (z).</param>
        /// <param name="pitchDegrees">Roof pitch.</param>
        /// <param name="overhang">Overhang beyond the walls.</param>
        /// <param name="thickness">Slab thickness (vertical).</param>
        /// <param name="coverage">Share 0..1 of the slab that exists, from the back (−z).</param>
        /// <param name="gables">True to add the gable walls.</param>
        public static MeshBuffers LeanTo(double width, double depth, double pitchDegrees, double overhang, double thickness,
            double coverage = 1.0, bool gables = true)
        {
            Check(width, depth, pitchDegrees, overhang, thickness);
            double half = width * 0.5;
            double rise = Rise(RoofKind.LeanTo, width, pitchDegrees);
            double slope = rise / width;
            double z0 = -depth * 0.5 - overhang;
            double z1 = depth * 0.5 + overhang;
            var mesh = new MeshBuffers(2);
            double end = z0 + Clamp01(coverage) * (z1 - z0);
            if (end > z0 + 1e-6)
            {
                Slab(mesh, half + overhang, -overhang * slope, -half - overhang, rise + overhang * slope, thickness, z0, end);
            }

            if (gables)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    double z = side * depth * 0.5;
                    mesh.AddTriangle(GableSubmesh, new GeometryVector(-half, 0.0, z), new GeometryVector(half, 0.0, z),
                        new GeometryVector(-half, rise - thickness, z), new GeometryVector(0.0, 0.0, side));
                }
            }

            return mesh;
        }

        /// <summary>
        /// One slab between the low edge (x = <paramref name="lowX"/>, top at <paramref name="lowY"/>) and the high edge
        /// (x = <paramref name="highX"/>, top at <paramref name="highY"/>), from z0 to z1; the bottom lies
        /// <paramref name="thickness"/> lower.
        /// </summary>
        private static void Slab(MeshBuffers mesh, double lowX, double lowY, double highX, double highY, double thickness, double z0, double z1)
        {
            var a0 = new GeometryVector(lowX, lowY, z0);
            var a1 = new GeometryVector(lowX, lowY, z1);
            var b0 = new GeometryVector(highX, highY, z0);
            var b1 = new GeometryVector(highX, highY, z1);
            var down = new GeometryVector(0.0, -thickness, 0.0);
            GeometryVector c0 = a0 + down;
            GeometryVector c1 = a1 + down;
            GeometryVector d0 = b0 + down;
            GeometryVector d1 = b1 + down;

            // Upward normal of the slope: perpendicular to (high - low) in the x/y plane, pointing up.
            double sx = highX - lowX;
            double sy = highY - lowY;
            var up = new GeometryVector(-sy * Math.Sign(sx), Math.Abs(sx), 0.0);
            var outwardLow = new GeometryVector(Math.Sign(lowX - highX), 0.0, 0.0);
            mesh.AddQuad(RoofSubmesh, a0, a1, b1, b0, up);
            mesh.AddQuad(RoofSubmesh, c0, c1, d1, d0, up * -1.0);
            mesh.AddQuad(RoofSubmesh, a0, a1, c1, c0, outwardLow);
            mesh.AddQuad(RoofSubmesh, b0, b1, d1, d0, outwardLow * -1.0);
            mesh.AddQuad(RoofSubmesh, a0, b0, d0, c0, new GeometryVector(0.0, 0.0, -1.0));
            mesh.AddQuad(RoofSubmesh, a1, b1, d1, c1, new GeometryVector(0.0, 0.0, 1.0));
        }

        private static void Check(double width, double depth, double pitchDegrees, double overhang, double thickness)
        {
            if (width <= 0.0 || depth <= 0.0 || pitchDegrees <= 0.0 || pitchDegrees >= 80.0 || overhang < 0.0 || thickness <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(width), "Roof: width, depth and thickness > 0, pitch 0..80 degrees, overhang >= 0.");
            }
        }

        private static double Clamp01(double value)
        {
            return value < 0.0 ? 0.0 : (value > 1.0 ? 1.0 : value);
        }
    }
}
