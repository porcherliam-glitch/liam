using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Pooled effects: particles (blood, sparks, smoke, fire, toxic), decals, explosion flashes and bullet tracers.</summary>
    public sealed class FxSystem
    {
        private sealed class Particle { public Transform t; public Renderer r; public Vector3 v; public float life, max, size, grow; public bool gravity, active; }
        private sealed class DecalItem { public Transform t; public float life; }
        private sealed class Flash { public Transform t; public Light light; public float life, max, radius; public bool active; }

        private readonly Transform _root;
        private readonly List<Particle> _particles = new List<Particle>();
        private readonly List<DecalItem> _decals = new List<DecalItem>();
        private readonly List<Flash> _flashes = new List<Flash>();
        private readonly Dictionary<object, Transform> _tracers = new Dictionary<object, Transform>();
        private readonly Stack<Transform> _tracerPool = new Stack<Transform>();
        private int _nextParticle, _nextDecal;
        private readonly Mesh _cube, _quad, _sphere;
        public readonly Material blood, spark, smoke, fire, toxic, dust, brass, scorch, bloodDecal, tracer, explosion;
        public int quality = 2;

        public FxSystem(Transform parent)
        {
            _root = new GameObject("Fx").transform;
            _root.SetParent(parent, false);
            var mb = new MeshBuilder(); mb.BoxCenter(null, Vector3.zero, Vector3.one); _cube = mb.Build("fxCube");
            mb = new MeshBuilder(); mb.Floor(null, -0.5f, -0.5f, 0.5f, 0.5f, 0); _quad = mb.Build("fxQuad");
            mb = new MeshBuilder(); mb.Sphere(null, Vector3.zero, Vector3.one * 0.5f, 10, 7); _sphere = mb.Build("fxSphere");
            blood = Mats.Lit(new Color(0.45f, 0.03f, 0.03f), 0.5f);
            spark = Mats.Emissive(new Color(1f, 0.85f, 0.4f), new Color(1f, 0.75f, 0.3f), 4f);
            smoke = Mats.Lit(new Color(0.35f, 0.35f, 0.35f), 0f);
            fire = Mats.Emissive(new Color(1f, 0.5f, 0.1f), new Color(1f, 0.45f, 0.08f), 4f);
            toxic = Mats.Emissive(new Color(0.35f, 0.9f, 0.2f), new Color(0.3f, 1f, 0.15f), 2.2f);
            dust = Mats.Lit(new Color(0.45f, 0.4f, 0.33f), 0f);
            brass = Mats.Lit(new Color(0.8f, 0.62f, 0.25f), 0.7f, 0.9f);
            scorch = Mats.Lit(new Color(0.05f, 0.045f, 0.04f), 0f);
            bloodDecal = Mats.Lit(new Color(0.3f, 0.02f, 0.02f), 0.65f);
            tracer = Mats.Emissive(new Color(1f, 0.9f, 0.6f), new Color(1f, 0.85f, 0.5f), 5f);
            explosion = Mats.Emissive(new Color(1f, 0.6f, 0.2f), new Color(1f, 0.55f, 0.15f), 6f);
        }

        private Transform NewObj(string name, Mesh mesh, Material mat, bool shadows = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go.transform;
        }

        private int MaxParticles => quality <= 0 ? 120 : quality == 1 ? 220 : 360;

        public void Emit(Vector3 pos, Vector3 vel, Material mat, float size, float life, bool gravity = true, float grow = 0f, bool sphere = false)
        {
            Particle p;
            if (_particles.Count < MaxParticles)
            {
                p = new Particle();
                p.t = NewObj("P", sphere ? _sphere : _cube, mat);
                p.r = p.t.GetComponent<Renderer>();
                _particles.Add(p);
            }
            else
            {
                p = _particles[_nextParticle];
                _nextParticle = (_nextParticle + 1) % _particles.Count;
                p.r.sharedMaterial = mat;
            }
            p.t.gameObject.SetActive(true);
            p.t.position = pos;
            p.t.rotation = Random.rotation;
            p.v = vel; p.life = life; p.max = life; p.size = size; p.gravity = gravity; p.grow = grow; p.active = true;
            p.t.localScale = Vector3.one * size;
        }

        public void Burst(Vector3 pos, int n, Material mat, float speed, float size, float life, bool gravity = true, float up = 1f)
        {
            if (quality <= 0) n = Mathf.Max(1, n / 2);
            for (int i = 0; i < n; i++)
            {
                var d = Random.insideUnitSphere;
                d.y = Mathf.Abs(d.y) * up;
                Emit(pos, d * speed * Random.Range(0.4f, 1f), mat, size * Random.Range(0.6f, 1.2f), life * Random.Range(0.6f, 1.1f), gravity);
            }
        }

        public void Decal(Vector3 pos, float size, Material mat, float life = 40f)
        {
            DecalItem d;
            int max = quality <= 0 ? 60 : 160;
            if (_decals.Count < max)
            {
                d = new DecalItem { t = NewObj("Decal", _quad, mat) };
                _decals.Add(d);
            }
            else
            {
                d = _decals[_nextDecal];
                _nextDecal = (_nextDecal + 1) % _decals.Count;
                d.t.GetComponent<Renderer>().sharedMaterial = mat;
            }
            d.t.gameObject.SetActive(true);
            d.t.position = new Vector3(pos.x, 0.012f + Random.Range(0f, 0.004f), pos.z);
            d.t.rotation = Quaternion.Euler(0, Random.Range(0f, 360f), 0);
            d.t.localScale = new Vector3(size * Random.Range(0.7f, 1.3f), 1, size * Random.Range(0.7f, 1.3f));
            d.life = life;
        }

        public void Explosion(Vector3 pos, float radius, bool small = false)
        {
            Flash f = null;
            foreach (var x in _flashes) if (!x.active) { f = x; break; }
            if (f == null)
            {
                f = new Flash { t = NewObj("Explosion", _sphere, explosion) };
                f.light = f.t.gameObject.AddComponent<Light>();
                f.light.type = LightType.Point;
                f.light.color = new Color(1f, 0.6f, 0.25f);
                f.light.shadows = LightShadows.None;
                _flashes.Add(f);
            }
            f.active = true;
            f.t.gameObject.SetActive(true);
            f.t.position = pos + Vector3.up * 0.6f;
            f.life = f.max = small ? 0.25f : 0.4f;
            f.radius = radius;
            f.light.range = radius * 3f;
            Burst(pos + Vector3.up * 0.5f, small ? 10 : 26, fire, radius * 1.6f, 0.25f, 0.6f, true, 1.5f);
            Burst(pos + Vector3.up * 0.5f, small ? 6 : 16, smoke, radius * 0.6f, 0.6f, 1.6f, false, 1.2f);
            if (!small) Decal(pos, radius * 0.9f, scorch, 60f);
        }

        public void Tracer(object key, Vector3 from, Vector3 to)
        {
            if (!_tracers.TryGetValue(key, out var t))
            {
                t = _tracerPool.Count > 0 ? _tracerPool.Pop() : NewObj("Tracer", _cube, tracer);
                t.gameObject.SetActive(true);
                _tracers[key] = t;
            }
            var d = to - from;
            float len = d.magnitude;
            if (len < 0.01f) { t.gameObject.SetActive(false); return; }
            t.gameObject.SetActive(true);
            t.position = (from + to) * 0.5f;
            t.rotation = Quaternion.LookRotation(d / len);
            t.localScale = new Vector3(0.04f, 0.04f, len);
        }

        /// <summary>Removes tracers whose projectile no longer exists.</summary>
        public void PruneTracers(HashSet<object> alive)
        {
            List<object> dead = null;
            foreach (var kv in _tracers) if (!alive.Contains(kv.Key)) (dead ??= new List<object>()).Add(kv.Key);
            if (dead == null) return;
            foreach (var k in dead)
            {
                var t = _tracers[k];
                t.gameObject.SetActive(false);
                _tracerPool.Push(t);
                _tracers.Remove(k);
            }
        }

        public void Update(float dt)
        {
            foreach (var p in _particles)
            {
                if (!p.active) continue;
                p.life -= dt;
                if (p.life <= 0) { p.active = false; p.t.gameObject.SetActive(false); continue; }
                if (p.gravity) p.v.y -= 9.81f * dt;
                else p.v *= Mathf.Exp(-1.5f * dt);
                var pos = p.t.position + p.v * dt;
                if (pos.y < 0.02f) { pos.y = 0.02f; p.v *= 0.3f; p.v.y = 0; }
                p.t.position = pos;
                float k = p.life / p.max;
                p.t.localScale = Vector3.one * (p.size * (0.3f + 0.7f * k) + p.grow * (1 - k));
            }
            foreach (var d in _decals)
            {
                if (!d.t.gameObject.activeSelf) continue;
                d.life -= dt;
                if (d.life <= 0) d.t.gameObject.SetActive(false);
            }
            foreach (var f in _flashes)
            {
                if (!f.active) continue;
                f.life -= dt;
                if (f.life <= 0) { f.active = false; f.t.gameObject.SetActive(false); continue; }
                float k = 1 - f.life / f.max;
                f.t.localScale = Vector3.one * Mathf.Lerp(0.3f, f.radius * 1.4f, Mathf.Sqrt(k)) * (1 - k * 0.5f);
                f.light.intensity = 14f * (1 - k);
            }
        }

        public void Clear()
        {
            foreach (var p in _particles) { p.active = false; p.t.gameObject.SetActive(false); }
            foreach (var d in _decals) d.t.gameObject.SetActive(false);
            foreach (var f in _flashes) { f.active = false; f.t.gameObject.SetActive(false); }
            foreach (var t in _tracers.Values) { t.gameObject.SetActive(false); _tracerPool.Push(t); }
            _tracers.Clear();
        }
    }
}
