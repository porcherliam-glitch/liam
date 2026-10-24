using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>
    /// Accumulates boxes, quads, cylinders and spheres into one mesh with one submesh per material.
    /// UVs are planar in mesh space (box mapping by the face normal), so tiling textures keep their size on every face.
    /// </summary>
    public sealed class MeshBuilder
    {
        /// <summary>Texture repeats per metre of the planar UVs: one repeat of a procedural texture covers 2 m.</summary>
        public const float UvScale = 0.5f;

        /// <summary>
        /// Per-quad 0..1 UVs instead of planar ones, for unit meshes that are scaled per instance and need the whole
        /// texture on every face (decals, particles).
        /// </summary>
        public bool unitUv;

        private readonly List<Vector3> _v = new List<Vector3>();
        private readonly List<Vector3> _n = new List<Vector3>();
        private readonly List<Vector2> _uv = new List<Vector2>();
        private readonly List<Material> _mats = new List<Material>();
        private readonly List<List<int>> _tris = new List<List<int>>();

        public int VertexCount => _v.Count;
        public bool Empty => _v.Count == 0;

        private List<int> Sub(Material m)
        {
            int i = _mats.IndexOf(m);
            if (i < 0) { _mats.Add(m); _tris.Add(new List<int>()); i = _mats.Count - 1; }
            return _tris[i];
        }

        /// <summary>Planar UV of a point, projected along the dominant axis of the normal (up/down: x,z; ±x: z,y; ±z: x,y).</summary>
        public static Vector2 PlanarUv(Vector3 p, Vector3 normal)
        {
            float ax = Mathf.Abs(normal.x), ay = Mathf.Abs(normal.y), az = Mathf.Abs(normal.z);
            if (ay >= ax && ay >= az) return new Vector2(p.x * UvScale, p.z * UvScale);
            if (ax >= az) return new Vector2(p.z * UvScale, p.y * UvScale);
            return new Vector2(p.x * UvScale, p.y * UvScale);
        }

        /// <summary>Texture repeats around a circumference: whole repeats (no seam) unless the shape is too thin to show one.</summary>
        private static float Around(float circumference)
        {
            float r = circumference * UvScale;
            return r < 0.75f ? r : Mathf.Round(r);
        }

        private void AddUnitQuadUvs() { _uv.Add(new Vector2(0, 0)); _uv.Add(new Vector2(0, 1)); _uv.Add(new Vector2(1, 1)); _uv.Add(new Vector2(1, 0)); }

        /// <summary>Quad a-b-c-d, clockwise when seen from the side the normal points to (Unity front faces).</summary>
        public void Quad(Material m, Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal)
        {
            var t = Sub(m);
            int i = _v.Count;
            _v.Add(a); _v.Add(b); _v.Add(c); _v.Add(d);
            for (int k = 0; k < 4; k++) _n.Add(normal);
            if (unitUv) AddUnitQuadUvs();
            else { _uv.Add(PlanarUv(a, normal)); _uv.Add(PlanarUv(b, normal)); _uv.Add(PlanarUv(c, normal)); _uv.Add(PlanarUv(d, normal)); }
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
            t.Add(i); t.Add(i + 2); t.Add(i + 3);
        }

        /// <summary>Horizontal quad facing up between (x0,z0) and (x1,z1) at height y.</summary>
        public void Floor(Material m, float x0, float z0, float x1, float z1, float y)
        {
            Quad(m, new Vector3(x0, y, z0), new Vector3(x0, y, z1), new Vector3(x1, y, z1), new Vector3(x1, y, z0), Vector3.up);
        }

        /// <summary>Axis-aligned box. faces: bit 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z.</summary>
        public void Box(Material m, Vector3 min, Vector3 max, int faces = 0b110111)
        {
            float x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
            if ((faces & 1) != 0) Quad(m, new Vector3(x1, y0, z0), new Vector3(x1, y1, z0), new Vector3(x1, y1, z1), new Vector3(x1, y0, z1), Vector3.right);
            if ((faces & 2) != 0) Quad(m, new Vector3(x0, y0, z1), new Vector3(x0, y1, z1), new Vector3(x0, y1, z0), new Vector3(x0, y0, z0), Vector3.left);
            if ((faces & 4) != 0) Quad(m, new Vector3(x0, y1, z0), new Vector3(x0, y1, z1), new Vector3(x1, y1, z1), new Vector3(x1, y1, z0), Vector3.up);
            if ((faces & 8) != 0) Quad(m, new Vector3(x0, y0, z1), new Vector3(x0, y0, z0), new Vector3(x1, y0, z0), new Vector3(x1, y0, z1), Vector3.down);
            if ((faces & 16) != 0) Quad(m, new Vector3(x1, y0, z1), new Vector3(x1, y1, z1), new Vector3(x0, y1, z1), new Vector3(x0, y0, z1), Vector3.forward);
            if ((faces & 32) != 0) Quad(m, new Vector3(x0, y0, z0), new Vector3(x0, y1, z0), new Vector3(x1, y1, z0), new Vector3(x1, y0, z0), Vector3.back);
        }

        public void BoxCenter(Material m, Vector3 center, Vector3 size, int faces = 0b111111) => Box(m, center - size * 0.5f, center + size * 0.5f, faces);

        /// <summary>Box rotated around Y by yawDeg around its centre.</summary>
        public void BoxRotated(Material m, Vector3 center, Vector3 size, float yawDeg)
        {
            // built axis-aligned (so the UVs follow the faces) and then turned around the centre
            var q = Quaternion.Euler(0, yawDeg, 0);
            int start = _v.Count;
            Box(m, center - size * 0.5f, center + size * 0.5f, 0b111111);
            for (int i = start; i < _v.Count; i++)
            {
                _v[i] = center + q * (_v[i] - center);
                _n[i] = q * _n[i];
            }
        }

        /// <summary>Upright cylinder (prism) from y0 to y1.</summary>
        public void Cylinder(Material m, Vector3 baseCenter, float radius, float height, int segments = 10, bool caps = true)
        {
            var t = Sub(m);
            float y0 = baseCenter.y, y1 = baseCenter.y + height;
            // u runs around the side and v up it at the same scale as on boxes; the cap is projected from above
            float around = Around(2f * Mathf.PI * radius), v0 = y0 * UvScale, v1 = y1 * UvScale;
            for (int s = 0; s < segments; s++)
            {
                float a0 = s * Mathf.PI * 2 / segments, a1 = (s + 1) * Mathf.PI * 2 / segments;
                Vector3 d0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)), d1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1));
                Vector3 p0 = baseCenter + d0 * radius, p1 = baseCenter + d1 * radius;
                int i = _v.Count;
                _v.Add(new Vector3(p0.x, y0, p0.z)); _v.Add(new Vector3(p0.x, y1, p0.z)); _v.Add(new Vector3(p1.x, y1, p1.z)); _v.Add(new Vector3(p1.x, y0, p1.z));
                _n.Add(d0); _n.Add(d0); _n.Add(d1); _n.Add(d1);
                if (unitUv) AddUnitQuadUvs();
                else
                {
                    float u0 = around * s / segments, u1 = around * (s + 1) / segments;
                    _uv.Add(new Vector2(u0, v0)); _uv.Add(new Vector2(u0, v1)); _uv.Add(new Vector2(u1, v1)); _uv.Add(new Vector2(u1, v0));
                }
                t.Add(i); t.Add(i + 1); t.Add(i + 2);
                t.Add(i); t.Add(i + 2); t.Add(i + 3);
                if (caps)
                {
                    int c = _v.Count;
                    _v.Add(new Vector3(baseCenter.x, y1, baseCenter.z)); _v.Add(new Vector3(p0.x, y1, p0.z)); _v.Add(new Vector3(p1.x, y1, p1.z));
                    _n.Add(Vector3.up); _n.Add(Vector3.up); _n.Add(Vector3.up);
                    for (int k = c; k < c + 3; k++) _uv.Add(unitUv ? Vector2.zero : PlanarUv(_v[k], Vector3.up));
                    t.Add(c); t.Add(c + 2); t.Add(c + 1);
                }
            }
        }

        /// <summary>Horizontal cylinder with end caps along the x axis (alongX) or the z axis.</summary>
        public void CylinderX(Material m, Vector3 center, float radius, float length, bool alongX, int segments = 10)
        {
            var t = Sub(m);
            Vector3 axis = alongX ? Vector3.right : Vector3.forward;
            // basis (u, axis, w) oriented like (x, y, z) of the upright Cylinder so the same winding faces outwards
            Vector3 u = Vector3.up, w = alongX ? Vector3.back : Vector3.right;
            Vector3 a = center - axis * length * 0.5f, b = center + axis * length * 0.5f;
            // u runs around the side, v along the axis; the caps are projected along the axis
            float around = Around(2f * Mathf.PI * radius), va = Vector3.Dot(a, axis) * UvScale, vb = Vector3.Dot(b, axis) * UvScale;
            for (int s = 0; s < segments; s++)
            {
                float a0 = s * Mathf.PI * 2 / segments, a1 = (s + 1) * Mathf.PI * 2 / segments;
                Vector3 d0 = u * Mathf.Cos(a0) + w * Mathf.Sin(a0), d1 = u * Mathf.Cos(a1) + w * Mathf.Sin(a1);
                int i = _v.Count;
                _v.Add(a + d0 * radius); _v.Add(b + d0 * radius); _v.Add(b + d1 * radius); _v.Add(a + d1 * radius);
                _n.Add(d0); _n.Add(d0); _n.Add(d1); _n.Add(d1);
                if (unitUv) AddUnitQuadUvs();
                else
                {
                    float u0 = around * s / segments, u1 = around * (s + 1) / segments;
                    _uv.Add(new Vector2(u0, va)); _uv.Add(new Vector2(u0, vb)); _uv.Add(new Vector2(u1, vb)); _uv.Add(new Vector2(u1, va));
                }
                t.Add(i); t.Add(i + 1); t.Add(i + 2);
                t.Add(i); t.Add(i + 2); t.Add(i + 3);
                int c = _v.Count;
                _v.Add(b); _v.Add(b + d0 * radius); _v.Add(b + d1 * radius);
                _n.Add(axis); _n.Add(axis); _n.Add(axis);
                _v.Add(a); _v.Add(a + d0 * radius); _v.Add(a + d1 * radius);
                _n.Add(-axis); _n.Add(-axis); _n.Add(-axis);
                for (int k = c; k < c + 6; k++) _uv.Add(unitUv ? Vector2.zero : PlanarUv(_v[k], axis));
                t.Add(c); t.Add(c + 2); t.Add(c + 1);
                t.Add(c + 3); t.Add(c + 4); t.Add(c + 5);
            }
        }

        /// <summary>Ellipsoid; its UVs wrap the whole surface once (longitude, latitude).</summary>
        public void Sphere(Material m, Vector3 center, Vector3 radii, int lon = 10, int lat = 7)
        {
            var t = Sub(m);
            int start = _v.Count;
            for (int y = 0; y <= lat; y++)
            {
                float v = (float)y / lat, phi = v * Mathf.PI;
                for (int x = 0; x <= lon; x++)
                {
                    float u = (float)x / lon, th = u * Mathf.PI * 2;
                    var n = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    _v.Add(center + Vector3.Scale(n, radii));
                    _n.Add(n);
                    _uv.Add(new Vector2(u, v));
                }
            }
            for (int y = 0; y < lat; y++)
                for (int x = 0; x < lon; x++)
                {
                    int a = start + y * (lon + 1) + x, b = a + lon + 1;
                    t.Add(a); t.Add(a + 1); t.Add(b);
                    t.Add(a + 1); t.Add(b + 1); t.Add(b);
                }
        }

        public Mesh Build(string name = "mesh")
        {
            var mesh = new Mesh { name = name };
            if (_v.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(_v);
            mesh.SetNormals(_n);
            mesh.SetUVs(0, _uv);
            mesh.subMeshCount = _tris.Count;
            for (int i = 0; i < _tris.Count; i++) mesh.SetTriangles(_tris[i], i);
            mesh.RecalculateBounds();
            return mesh;
        }

        public Material[] Materials => _mats.ToArray();

        /// <summary>Creates a GameObject with the built mesh.</summary>
        public GameObject ToObject(string name, Transform parent, bool castShadows = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = Build(name);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = Materials;
            mr.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            return go;
        }
    }
}
