using System;

namespace Aetherfall.World
{
    /// <summary>
    /// Arch of the stone bridge (layout bridge kind <c>stone</c>), the same as <c>stone_arch</c> in Tools/Preview/eichental_layout.py.
    /// Local axes of the bridge: x across (width), y up with y = 0 at the top of the deck, z along the bridge. The deck is a slab
    /// of <see cref="DeckThickness"/>; the arch is a flat ring segment under it whose top touches the underside of the deck, so
    /// nothing of it stands on the roadway and the water flows through the opening under the ring.
    /// </summary>
    public static class BridgeGeometry
    {
        /// <summary>Thickness of the stone deck (top at y = 0).</summary>
        public const double DeckThickness = 0.6;

        /// <summary>Outer radius of the arch as share of the bridge length (flat segmental arch).</summary>
        public const double ArchRadiusShare = 0.6;

        /// <summary>Thickness of the arch ring.</summary>
        public const double ArchRing = 0.5;

        /// <summary>Segments of the arch ring.</summary>
        public const int ArchSegments = 12;

        /// <summary>Outer radius of the arch.</summary>
        /// <param name="length">Bridge length.</param>
        public static double ArchRadius(double length)
        {
            return ArchRadiusShare * length;
        }

        /// <summary>Height of the arch centre (far below the deck; the ring only shows its top).</summary>
        /// <param name="length">Bridge length.</param>
        public static double ArchCenterY(double length)
        {
            return -DeckThickness - ArchRadius(length);
        }

        /// <summary>
        /// Closed ring segment under the deck, from z = −length/2 to +length/2, extruded across the full width. Its highest point is
        /// the underside of the deck (y = −<see cref="DeckThickness"/>).
        /// </summary>
        /// <param name="width">Bridge width.</param>
        /// <param name="length">Bridge length.</param>
        public static MeshBuffers StoneArch(double width, double length)
        {
            if (width <= 0.0 || length <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(length), "Width and length must be greater than 0.");
            }

            double outer = ArchRadius(length);
            double inner = outer - ArchRing;
            double cy = ArchCenterY(length);
            double half = Math.Asin(Math.Min(1.0, length * 0.5 / outer));
            double hx = width * 0.5;
            var mesh = new MeshBuffers(1);
            for (int i = 0; i < ArchSegments; i++)
            {
                double a0 = -half + 2.0 * half * i / ArchSegments;
                double a1 = -half + 2.0 * half * (i + 1) / ArchSegments;
                double am = (a0 + a1) * 0.5;
                var radial = new GeometryVector(0.0, Math.Cos(am), Math.Sin(am));
                GeometryVector o0 = Ring(outer, cy, a0);
                GeometryVector o1 = Ring(outer, cy, a1);
                GeometryVector i0 = Ring(inner, cy, a0);
                GeometryVector i1 = Ring(inner, cy, a1);
                var left = new GeometryVector(-hx, 0.0, 0.0);
                var right = new GeometryVector(hx, 0.0, 0.0);

                // Top (extrados), underside of the opening (intrados) and the two side faces.
                mesh.AddQuad(0, o0 + left, o0 + right, o1 + right, o1 + left, radial);
                mesh.AddQuad(0, i0 + left, i0 + right, i1 + right, i1 + left, radial * -1.0);
                mesh.AddQuad(0, o0 + left, o1 + left, i1 + left, i0 + left, new GeometryVector(-1.0, 0.0, 0.0));
                mesh.AddQuad(0, o0 + right, o1 + right, i1 + right, i0 + right, new GeometryVector(1.0, 0.0, 0.0));
            }

            // End faces where the ring meets the banks.
            for (int end = -1; end <= 1; end += 2)
            {
                double a = end * half;
                GeometryVector o = Ring(outer, cy, a);
                GeometryVector n = Ring(inner, cy, a);
                var tangent = new GeometryVector(0.0, -Math.Sin(a) * end, Math.Cos(a) * end);
                mesh.AddQuad(0, o + new GeometryVector(-hx, 0.0, 0.0), o + new GeometryVector(hx, 0.0, 0.0), n + new GeometryVector(hx, 0.0, 0.0),
                    n + new GeometryVector(-hx, 0.0, 0.0), tangent);
            }

            return mesh;
        }

        private static GeometryVector Ring(double radius, double cy, double angle)
        {
            return new GeometryVector(0.0, cy + radius * Math.Cos(angle), radius * Math.Sin(angle));
        }
    }
}
