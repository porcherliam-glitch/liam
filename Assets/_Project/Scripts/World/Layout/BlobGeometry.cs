using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.World
{
    /// <summary>
    /// Lumpy ellipsoids for tree crowns, bushes and rocks: an icosphere whose vertices are pushed in or out by a deterministic
    /// random amount (<see cref="Pcg32Random"/>), optionally clamped (flat bottom, flat sides). Vertices are shared (smooth
    /// shading). Pure C#: the Unity generator copies the buffers into a mesh, and Tools/Preview/eichental_layout.py
    /// (<c>blob</c>) builds the same vertices for the Blender preview; the EditMode tests compare both.
    /// </summary>
    /// <remarks>
    /// The icosphere keeps the vertices of the coarser levels at the front of the list (subdivision only appends midpoints), and
    /// the random bumps are drawn in vertex order. A blob with fewer subdivisions therefore has the same first vertices as a finer
    /// one with the same seed - used for simple convex colliders of rocks.
    /// </remarks>
    public static class BlobGeometry
    {
        /// <summary>Highest supported number of subdivisions (3 = 642 vertices).</summary>
        public const int MaxSubdivisions = 3;

        /// <summary>Builds a blob without clamping.</summary>
        /// <param name="center">Centre (local mesh coordinates).</param>
        /// <param name="radii">Radii along x, y, z.</param>
        /// <param name="subdivisions">0–3 (12, 42, 162 or 642 vertices).</param>
        /// <param name="seed">Seed of the bumps.</param>
        /// <param name="roughness">Bump strength as share of the radius (a vertex moves by up to ± roughness / 2).</param>
        /// <returns>One submesh.</returns>
        public static MeshBuffers Build(GeometryVector center, GeometryVector radii, int subdivisions, ulong seed, double roughness)
        {
            return Build(center, radii, subdivisions, seed, roughness, double.NegativeInfinity, double.PositiveInfinity);
        }

        /// <summary>
        /// Builds a blob and clamps every vertex (after adding the centre) to y ≥ <paramref name="minY"/> and
        /// |x| ≤ <paramref name="maxAbsX"/>: a flat underside and two flat, cliff-like sides.
        /// </summary>
        /// <param name="center">Centre (local mesh coordinates).</param>
        /// <param name="radii">Radii along x, y, z.</param>
        /// <param name="subdivisions">0–3.</param>
        /// <param name="seed">Seed of the bumps.</param>
        /// <param name="roughness">Bump strength as share of the radius.</param>
        /// <param name="minY">Lowest allowed y (negative infinity = no clamp).</param>
        /// <param name="maxAbsX">Largest allowed |x| (positive infinity = no clamp).</param>
        /// <returns>One submesh.</returns>
        public static MeshBuffers Build(GeometryVector center, GeometryVector radii, int subdivisions, ulong seed, double roughness, double minY,
            double maxAbsX)
        {
            Icosphere(subdivisions, out List<GeometryVector> points, out List<int> faces);
            var random = new Pcg32Random(seed);
            var mesh = new MeshBuffers(1);
            for (int i = 0; i < points.Count; i++)
            {
                GeometryVector n = points[i];
                double bump = 1.0 + (random.NextFloat() - 0.5) * roughness;
                double x = center.X + n.X * radii.X * bump;
                double y = center.Y + n.Y * radii.Y * bump;
                double z = center.Z + n.Z * radii.Z * bump;
                x = Math.Max(-maxAbsX, Math.Min(maxAbsX, x));
                y = Math.Max(minY, y);
                mesh.AddSharedVertex(new GeometryVector(x, y, z), n.X * 0.5 + 0.5, n.Y * 0.5 + 0.5);
            }

            for (int i = 0; i < faces.Count; i += 3)
            {
                int a = faces[i];
                int b = faces[i + 1];
                int c = faces[i + 2];

                // The winding follows the unit sphere, so clamped (flattened) faces keep facing outwards.
                GeometryVector pa = points[a];
                GeometryVector outward = pa + points[b] + points[c];
                if (GeometryVector.Dot(GeometryVector.Cross(points[b] - pa, points[c] - pa), outward) < 0.0)
                {
                    int swap = b;
                    b = c;
                    c = swap;
                }

                mesh.AddIndexedTriangle(0, a, b, c);
            }

            return mesh;
        }

        /// <summary>Number of vertices of an icosphere with the given subdivisions.</summary>
        /// <param name="subdivisions">0–3.</param>
        public static int VertexCount(int subdivisions)
        {
            int s = Math.Max(0, Math.Min(MaxSubdivisions, subdivisions));
            return 10 * (1 << (2 * s)) + 2;
        }

        /// <summary>Number of triangles of an icosphere with the given subdivisions.</summary>
        /// <param name="subdivisions">0–3.</param>
        public static int TriangleCount(int subdivisions)
        {
            int s = Math.Max(0, Math.Min(MaxSubdivisions, subdivisions));
            return 20 * (1 << (2 * s));
        }

        private static void Icosphere(int subdivisions, out List<GeometryVector> points, out List<int> faces)
        {
            double t = (1.0 + Math.Sqrt(5.0)) * 0.5;
            points = new List<GeometryVector>
            {
                new GeometryVector(-1, t, 0), new GeometryVector(1, t, 0), new GeometryVector(-1, -t, 0), new GeometryVector(1, -t, 0),
                new GeometryVector(0, -1, t), new GeometryVector(0, 1, t), new GeometryVector(0, -1, -t), new GeometryVector(0, 1, -t),
                new GeometryVector(t, 0, -1), new GeometryVector(t, 0, 1), new GeometryVector(-t, 0, -1), new GeometryVector(-t, 0, 1)
            };
            for (int i = 0; i < points.Count; i++)
            {
                points[i] = Normalized(points[i]);
            }

            faces = new List<int>
            {
                0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
                3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
            };
            int levels = Math.Max(0, Math.Min(MaxSubdivisions, subdivisions));
            for (int s = 0; s < levels; s++)
            {
                var cache = new Dictionary<long, int>();
                var next = new List<int>(faces.Count * 4);
                for (int i = 0; i < faces.Count; i += 3)
                {
                    int a = faces[i];
                    int b = faces[i + 1];
                    int c = faces[i + 2];
                    int ab = Midpoint(points, cache, a, b);
                    int bc = Midpoint(points, cache, b, c);
                    int ca = Midpoint(points, cache, c, a);
                    next.AddRange(new[] { a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca });
                }

                faces = next;
            }
        }

        private static int Midpoint(List<GeometryVector> points, Dictionary<long, int> cache, int a, int b)
        {
            long key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
            if (cache.TryGetValue(key, out int index))
            {
                return index;
            }

            points.Add(Normalized((points[a] + points[b]) * 0.5));
            index = points.Count - 1;
            cache.Add(key, index);
            return index;
        }

        private static GeometryVector Normalized(GeometryVector p)
        {
            double length = p.Length;
            return new GeometryVector(p.X / length, p.Y / length, p.Z / length);
        }
    }
}
