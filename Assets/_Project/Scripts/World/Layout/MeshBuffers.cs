using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Vertex and triangle lists of a mesh built in pure C# (e.g. <see cref="RoofGeometry"/>); the Unity generator copies them
    /// into a <c>UnityEngine.Mesh</c>. Every quad gets its own four vertices (flat shading). Triangles follow Unity's rule:
    /// the front side of a, b, c faces along Cross(b − a, c − a), i.e. clockwise seen from the front.
    /// </summary>
    public sealed class MeshBuffers
    {
        private readonly List<GeometryVector> _positions = new List<GeometryVector>();
        private readonly List<double> _uvs = new List<double>();
        private readonly List<List<int>> _submeshes = new List<List<int>>();

        /// <summary>Creates empty buffers.</summary>
        /// <param name="submeshCount">Number of submeshes (one material each).</param>
        public MeshBuffers(int submeshCount)
        {
            for (int i = 0; i < Math.Max(1, submeshCount); i++)
            {
                _submeshes.Add(new List<int>());
            }
        }

        /// <summary>Vertex positions.</summary>
        public IReadOnlyList<GeometryVector> Positions => _positions;

        /// <summary>Texture coordinates as u, v pairs (two entries per vertex).</summary>
        public IReadOnlyList<double> Uvs => _uvs;

        /// <summary>Number of submeshes.</summary>
        public int SubmeshCount => _submeshes.Count;

        /// <summary>Triangle indices of a submesh (three per triangle).</summary>
        /// <param name="submesh">Submesh index.</param>
        public IReadOnlyList<int> Triangles(int submesh)
        {
            return _submeshes[submesh];
        }

        /// <summary>Total number of triangles.</summary>
        public int TriangleCount
        {
            get
            {
                int count = 0;
                for (int i = 0; i < _submeshes.Count; i++)
                {
                    count += _submeshes[i].Count / 3;
                }

                return count;
            }
        }

        /// <summary>
        /// Adds a planar quad p0 → p1 → p2 → p3 (around the edge in either direction). The winding is chosen so that the front
        /// faces along <paramref name="outward"/>.
        /// </summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="p0">Corner 0.</param>
        /// <param name="p1">Corner 1.</param>
        /// <param name="p2">Corner 2.</param>
        /// <param name="p3">Corner 3.</param>
        /// <param name="outward">Direction the visible side faces.</param>
        public void AddQuad(int submesh, GeometryVector p0, GeometryVector p1, GeometryVector p2, GeometryVector p3, GeometryVector outward)
        {
            GeometryVector normal = GeometryVector.Cross(p1 - p0, p2 - p0);
            if (GeometryVector.Dot(normal, outward) < 0.0)
            {
                GeometryVector swap = p1;
                p1 = p3;
                p3 = swap;
            }

            int start = _positions.Count;
            AddVertex(p0, outward);
            AddVertex(p1, outward);
            AddVertex(p2, outward);
            AddVertex(p3, outward);
            List<int> triangles = _submeshes[submesh];
            triangles.Add(start);
            triangles.Add(start + 1);
            triangles.Add(start + 2);
            triangles.Add(start);
            triangles.Add(start + 2);
            triangles.Add(start + 3);
        }

        /// <summary>Adds a triangle whose front faces along <paramref name="outward"/>.</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="p0">Corner 0.</param>
        /// <param name="p1">Corner 1.</param>
        /// <param name="p2">Corner 2.</param>
        /// <param name="outward">Direction the visible side faces.</param>
        public void AddTriangle(int submesh, GeometryVector p0, GeometryVector p1, GeometryVector p2, GeometryVector outward)
        {
            GeometryVector normal = GeometryVector.Cross(p1 - p0, p2 - p0);
            if (GeometryVector.Dot(normal, outward) < 0.0)
            {
                GeometryVector swap = p1;
                p1 = p2;
                p2 = swap;
            }

            int start = _positions.Count;
            AddVertex(p0, outward);
            AddVertex(p1, outward);
            AddVertex(p2, outward);
            List<int> triangles = _submeshes[submesh];
            triangles.Add(start);
            triangles.Add(start + 1);
            triangles.Add(start + 2);
        }

        /// <summary>Adds a vertex that several triangles may share (smooth shading, e.g. <see cref="BlobGeometry"/>).</summary>
        /// <param name="position">Position.</param>
        /// <param name="u">Texture coordinate u.</param>
        /// <param name="v">Texture coordinate v.</param>
        /// <returns>Index of the vertex.</returns>
        public int AddSharedVertex(GeometryVector position, double u, double v)
        {
            _positions.Add(position);
            _uvs.Add(u);
            _uvs.Add(v);
            return _positions.Count - 1;
        }

        /// <summary>Adds a triangle from three vertex indices, in the given order (front along Cross(b − a, c − a)).</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="a">Index of corner a.</param>
        /// <param name="b">Index of corner b.</param>
        /// <param name="c">Index of corner c.</param>
        public void AddIndexedTriangle(int submesh, int a, int b, int c)
        {
            if (a < 0 || b < 0 || c < 0 || a >= _positions.Count || b >= _positions.Count || c >= _positions.Count)
            {
                throw new ArgumentOutOfRangeException(nameof(a), "Vertex index outside the buffer.");
            }

            List<int> triangles = _submeshes[submesh];
            triangles.Add(a);
            triangles.Add(b);
            triangles.Add(c);
        }

        /// <summary>
        /// Signed volume of the closed surface (sum of a · (b × c) / 6 over all triangles). Positive when all triangles face
        /// outwards.
        /// </summary>
        /// <param name="submesh">Submesh to measure, or −1 for all.</param>
        public double SignedVolume(int submesh = -1)
        {
            double volume = 0.0;
            for (int s = 0; s < _submeshes.Count; s++)
            {
                if (submesh >= 0 && s != submesh)
                {
                    continue;
                }

                List<int> t = _submeshes[s];
                for (int i = 0; i < t.Count; i += 3)
                {
                    volume += GeometryVector.Dot(_positions[t[i]], GeometryVector.Cross(_positions[t[i + 1]], _positions[t[i + 2]])) / 6.0;
                }
            }

            return volume;
        }

        private void AddVertex(GeometryVector p, GeometryVector outward)
        {
            _positions.Add(p);

            // Planar projection along the dominant axis of the face: 1 texture tile per metre.
            double ax = Math.Abs(outward.X);
            double ay = Math.Abs(outward.Y);
            double az = Math.Abs(outward.Z);
            if (ay >= ax && ay >= az)
            {
                _uvs.Add(p.X);
                _uvs.Add(p.Z);
            }
            else if (ax >= az)
            {
                _uvs.Add(p.Z);
                _uvs.Add(p.Y);
            }
            else
            {
                _uvs.Add(p.X);
                _uvs.Add(p.Y);
            }
        }
    }
}
