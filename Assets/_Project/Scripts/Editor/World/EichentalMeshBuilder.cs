using System.Collections.Generic;
using Aetherfall.Utilities;
using Aetherfall.World;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Collects boxes, cylinders, lumpy spheres and pure <see cref="MeshBuffers"/> (roofs) into one mesh with several submeshes
    /// (one material each). Every face is wound clockwise seen from outside (Unity front faces); the outward direction is
    /// checked per face, so the order of the corners in the callers does not matter.
    /// </summary>
    public sealed class EichentalMeshBuilder
    {
        private readonly List<Vector3> _vertices = new List<Vector3>();
        private readonly List<Vector2> _uvs = new List<Vector2>();
        private readonly List<List<int>> _triangles = new List<List<int>>();

        /// <summary>Creates an empty builder.</summary>
        /// <param name="submeshes">Number of submeshes.</param>
        public EichentalMeshBuilder(int submeshes)
        {
            for (int i = 0; i < Mathf.Max(1, submeshes); i++)
            {
                _triangles.Add(new List<int>());
            }
        }

        /// <summary>Number of vertices so far.</summary>
        public int VertexCount => _vertices.Count;

        /// <summary>Adds a box (flat shaded).</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="center">Centre.</param>
        /// <param name="size">Size along the local axes.</param>
        /// <param name="rotation">Rotation.</param>
        public void AddBox(int submesh, Vector3 center, Vector3 size, Quaternion rotation)
        {
            Vector3 h = size * 0.5f;
            var c = new Vector3[8];
            for (int i = 0; i < 8; i++)
            {
                var local = new Vector3((i & 1) == 0 ? -h.x : h.x, (i & 2) == 0 ? -h.y : h.y, (i & 4) == 0 ? -h.z : h.z);
                c[i] = center + rotation * local;
            }

            AddQuad(submesh, c[0], c[1], c[3], c[2], rotation * Vector3.back);
            AddQuad(submesh, c[4], c[5], c[7], c[6], rotation * Vector3.forward);
            AddQuad(submesh, c[0], c[2], c[6], c[4], rotation * Vector3.left);
            AddQuad(submesh, c[1], c[3], c[7], c[5], rotation * Vector3.right);
            AddQuad(submesh, c[0], c[1], c[5], c[4], rotation * Vector3.down);
            AddQuad(submesh, c[2], c[3], c[7], c[6], rotation * Vector3.up);
        }

        /// <summary>Adds a planar quad; the winding follows <paramref name="outward"/>.</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="a">Corner.</param>
        /// <param name="b">Corner.</param>
        /// <param name="c">Corner.</param>
        /// <param name="d">Corner.</param>
        /// <param name="outward">Visible side.</param>
        public void AddQuad(int submesh, Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 outward)
        {
            if (Vector3.Dot(Vector3.Cross(b - a, c - a), outward) < 0f)
            {
                Vector3 swap = b;
                b = d;
                d = swap;
            }

            int start = _vertices.Count;
            AddVertex(a, outward);
            AddVertex(b, outward);
            AddVertex(c, outward);
            AddVertex(d, outward);
            List<int> t = _triangles[submesh];
            t.Add(start);
            t.Add(start + 1);
            t.Add(start + 2);
            t.Add(start);
            t.Add(start + 2);
            t.Add(start + 3);
        }

        /// <summary>Adds a triangle; the winding follows <paramref name="outward"/>.</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="a">Corner.</param>
        /// <param name="b">Corner.</param>
        /// <param name="c">Corner.</param>
        /// <param name="outward">Visible side.</param>
        public void AddTriangle(int submesh, Vector3 a, Vector3 b, Vector3 c, Vector3 outward)
        {
            if (Vector3.Dot(Vector3.Cross(b - a, c - a), outward) < 0f)
            {
                Vector3 swap = b;
                b = c;
                c = swap;
            }

            int start = _vertices.Count;
            AddVertex(a, outward);
            AddVertex(b, outward);
            AddVertex(c, outward);
            List<int> t = _triangles[submesh];
            t.Add(start);
            t.Add(start + 1);
            t.Add(start + 2);
        }

        /// <summary>Adds a cylinder or cone along local y (base at <paramref name="baseCenter"/>).</summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="baseCenter">Centre of the bottom cap.</param>
        /// <param name="bottomRadius">Bottom radius.</param>
        /// <param name="topRadius">Top radius (0 = cone).</param>
        /// <param name="height">Height.</param>
        /// <param name="segments">Segments around.</param>
        /// <param name="rotation">Rotation of the axis.</param>
        public void AddCylinder(int submesh, Vector3 baseCenter, float bottomRadius, float topRadius, float height, int segments, Quaternion rotation)
        {
            Vector3 top = baseCenter + rotation * new Vector3(0f, height, 0f);
            for (int i = 0; i < segments; i++)
            {
                float a0 = i * Mathf.PI * 2f / segments;
                float a1 = (i + 1) * Mathf.PI * 2f / segments;
                Vector3 d0 = rotation * new Vector3(Mathf.Sin(a0), 0f, Mathf.Cos(a0));
                Vector3 d1 = rotation * new Vector3(Mathf.Sin(a1), 0f, Mathf.Cos(a1));
                Vector3 b0 = baseCenter + d0 * bottomRadius;
                Vector3 b1 = baseCenter + d1 * bottomRadius;
                Vector3 t0 = top + d0 * topRadius;
                Vector3 t1 = top + d1 * topRadius;
                Vector3 outward = (d0 + d1).normalized;
                if (topRadius > 0.0001f)
                {
                    AddQuad(submesh, b0, b1, t1, t0, outward);
                    AddTriangle(submesh, top, t0, t1, rotation * Vector3.up);
                }
                else
                {
                    AddTriangle(submesh, b0, b1, top, outward);
                }

                AddTriangle(submesh, baseCenter, b0, b1, rotation * Vector3.down);
            }
        }

        /// <summary>
        /// Adds a lumpy ellipsoid: an icosphere whose vertices are pushed in or out by a deterministic random amount
        /// (<see cref="Pcg32Random"/>), so tree crowns, bushes and rocks are not perfectly round. Shared vertices = smooth.
        /// </summary>
        /// <param name="submesh">Submesh.</param>
        /// <param name="center">Centre.</param>
        /// <param name="radii">Radii along x, y, z.</param>
        /// <param name="subdivisions">0–3.</param>
        /// <param name="seed">Seed of the bumps.</param>
        /// <param name="roughness">Bump strength (share of the radius).</param>
        /// <param name="flatBottom">Clamp vertices below the centre to it (rocks resting on the ground).</param>
        public void AddBlob(int submesh, Vector3 center, Vector3 radii, int subdivisions, ulong seed, float roughness, bool flatBottom = false)
        {
            List<Vector3> points;
            List<int> faces;
            Icosphere(subdivisions, out points, out faces);
            var random = new Pcg32Random(seed);
            int start = _vertices.Count;
            for (int i = 0; i < points.Count; i++)
            {
                Vector3 n = points[i];
                float bump = 1f + (random.NextFloat() - 0.5f) * roughness;
                var p = new Vector3(n.x * radii.x * bump, n.y * radii.y * bump, n.z * radii.z * bump);
                if (flatBottom && p.y < -radii.y * 0.2f)
                {
                    p.y = -radii.y * 0.2f;
                }

                _vertices.Add(center + p);
                _uvs.Add(new Vector2(n.x * 0.5f + 0.5f, n.y * 0.5f + 0.5f));
            }

            List<int> t = _triangles[submesh];
            for (int i = 0; i < faces.Count; i += 3)
            {
                int a = faces[i];
                int b = faces[i + 1];
                int c = faces[i + 2];
                Vector3 pa = points[a];
                Vector3 outward = pa + points[b] + points[c];
                if (Vector3.Dot(Vector3.Cross(points[b] - pa, points[c] - pa), outward) < 0f)
                {
                    int swap = b;
                    b = c;
                    c = swap;
                }

                t.Add(start + a);
                t.Add(start + b);
                t.Add(start + c);
            }
        }

        /// <summary>Adds pure mesh buffers (e.g. a roof from <see cref="RoofGeometry"/>), moved by <paramref name="offset"/>.</summary>
        /// <param name="buffers">Buffers.</param>
        /// <param name="offset">Offset of all vertices.</param>
        /// <param name="submeshMap">Target submesh for each source submesh.</param>
        public void AddBuffers(MeshBuffers buffers, Vector3 offset, int[] submeshMap)
        {
            int start = _vertices.Count;
            for (int i = 0; i < buffers.Positions.Count; i++)
            {
                GeometryVector p = buffers.Positions[i];
                _vertices.Add(new Vector3((float)p.X, (float)p.Y, (float)p.Z) + offset);
                _uvs.Add(new Vector2((float)buffers.Uvs[i * 2], (float)buffers.Uvs[i * 2 + 1]));
            }

            for (int s = 0; s < buffers.SubmeshCount; s++)
            {
                IReadOnlyList<int> source = buffers.Triangles(s);
                List<int> target = _triangles[submeshMap[s]];
                for (int i = 0; i < source.Count; i++)
                {
                    target.Add(start + source[i]);
                }
            }
        }

        /// <summary>Creates the Unity mesh (32-bit indices when needed, normals and bounds recalculated).</summary>
        /// <param name="name">Mesh name.</param>
        public Mesh ToMesh(string name)
        {
            var mesh = new Mesh { name = name };
            if (_vertices.Count > 65000)
            {
                mesh.indexFormat = IndexFormat.UInt32;
            }

            mesh.SetVertices(_vertices);
            mesh.SetUVs(0, _uvs);
            mesh.subMeshCount = _triangles.Count;
            for (int i = 0; i < _triangles.Count; i++)
            {
                mesh.SetTriangles(_triangles[i], i);
            }

            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private void AddVertex(Vector3 p, Vector3 outward)
        {
            _vertices.Add(p);
            float ax = Mathf.Abs(outward.x);
            float ay = Mathf.Abs(outward.y);
            float az = Mathf.Abs(outward.z);
            _uvs.Add(ay >= ax && ay >= az ? new Vector2(p.x, p.z) : (ax >= az ? new Vector2(p.z, p.y) : new Vector2(p.x, p.y)));
        }

        private static void Icosphere(int subdivisions, out List<Vector3> points, out List<int> faces)
        {
            float t = (1f + Mathf.Sqrt(5f)) * 0.5f;
            points = new List<Vector3>
            {
                new Vector3(-1, t, 0), new Vector3(1, t, 0), new Vector3(-1, -t, 0), new Vector3(1, -t, 0),
                new Vector3(0, -1, t), new Vector3(0, 1, t), new Vector3(0, -1, -t), new Vector3(0, 1, -t),
                new Vector3(t, 0, -1), new Vector3(t, 0, 1), new Vector3(-t, 0, -1), new Vector3(-t, 0, 1)
            };
            for (int i = 0; i < points.Count; i++)
            {
                points[i] = points[i].normalized;
            }

            faces = new List<int>
            {
                0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
                3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
            };
            for (int s = 0; s < Mathf.Clamp(subdivisions, 0, 3); s++)
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

        private static int Midpoint(List<Vector3> points, Dictionary<long, int> cache, int a, int b)
        {
            long key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
            if (cache.TryGetValue(key, out int index))
            {
                return index;
            }

            points.Add(((points[a] + points[b]) * 0.5f).normalized);
            index = points.Count - 1;
            cache.Add(key, index);
            return index;
        }
    }
}
