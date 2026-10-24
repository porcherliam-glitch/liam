using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>
    /// Pooled effects: particles (blood, sparks, smoke, fire, toxic, dust, casings), decals, explosion flashes and bullet tracers.
    /// Particles are soft sprites that turn to the camera (transparent templates from Mats.Particle) and fade through a
    /// MaterialPropertyBlock per instance; decals are round alpha-clipped splats. The public materials stand for an effect
    /// style (callers pass fx.smoke etc.). Without the templates (setup not run yet) everything falls back to the old
    /// opaque cubes and squares.
    /// </summary>
    public sealed class FxSystem
    {
        /// <summary>How a particle material looks and moves as a soft sprite.</summary>
        private sealed class Style
        {
            public Material mat;
            public Texture2D[] tex;
            /// <summary>Colour at birth and at the end of the life (alpha unused); above 1 glows in URP.</summary>
            public Color color, colorEnd;
            /// <summary>Peak opacity; sprite size relative to the size a caller passes (a soft sprite looks smaller than a cube).</summary>
            public float alpha = 1f, sizeScale = 1.6f;
            /// <summary>Share of the size lost / gained over the life; share of the life spent fading in; fade-out curve.</summary>
            public float shrink, growth, fadeIn, fadePow = 1f;
            /// <summary>Upward pull (m/s²), gravity factor, air drag with and without gravity.</summary>
            public float lift, gravityScale = 1f, airDrag, drag = 1.5f;
            /// <summary>Max roll speed (deg/s), flicker strength, darkest share of the ambient light, factor on the start speed.</summary>
            public float spin, flicker, ambientMin = 1f, speedScale = 1f;
            /// <summary>Stretched along the velocity instead of round.</summary>
            public bool streak;
            /// <summary>Faint puff spawned with some of the particles (blood mist).</summary>
            public Style mist;
            public float mistChance;
            public int colorId, texId;
            public float tintScale = 1f;
        }

        private sealed class Particle
        {
            public Transform t; public Renderer r; public MeshFilter mf; public MaterialPropertyBlock mpb; public Style style;
            public Vector3 v, spinAxis; public float life, max, size, grow, alpha, roll, rollSpeed, phase; public bool gravity, active, casing;
        }
        private sealed class DecalItem { public Transform t; public Renderer r; public MaterialPropertyBlock mpb; public Color color; public Vector3 baseScale; public float life; public bool tinted; }
        private sealed class Flash { public Transform t; public Renderer r; public MaterialPropertyBlock mpb; public Light light; public float life, max, radius; public bool active; }
        private sealed class TracerItem { public Transform t; public Vector3 from, to; }

        /// <summary>Seconds of flight a spark's streak shows.</summary>
        private const float StreakTime = 0.02f;
        /// <summary>Decals fade out over their last seconds.</summary>
        private const float DecalFade = 2f;
        /// <summary>Splat quads are larger than the old squares: the round shape leaves the corners empty.</summary>
        private const float SplatScale = 1.6f;
        /// <summary>Tracer width up close and its growth per metre of distance (keeps it about two pixels wide far away).</summary>
        private const float TracerWidth = 0.05f, TracerWidthPerMetre = 0.005f;

        private readonly Transform _root;
        private readonly List<Particle> _particles = new List<Particle>();
        private readonly List<DecalItem> _decals = new List<DecalItem>();
        private readonly List<Flash> _flashes = new List<Flash>();
        private readonly Dictionary<object, TracerItem> _tracers = new Dictionary<object, TracerItem>();
        private readonly Stack<TracerItem> _tracerPool = new Stack<TracerItem>();
        private readonly Dictionary<Material, Style> _styles = new Dictionary<Material, Style>();
        private int _nextParticle, _nextDecal;
        private float _time;
        private readonly Mesh _cube, _quad, _sphere, _sprite, _casing;
        private readonly bool _soft, _softDecals;
        private readonly Material[] _bloodSplats, _scorchSplats;
        private readonly Color _bloodColor = new Color(0.3f, 0.02f, 0.02f), _scorchColor = new Color(0.13f, 0.12f, 0.11f), _flashColor, _flashColorEnd;
        private readonly int _decalColorId, _flashColorId;
        private readonly float _flashTintScale = 1f;
        public readonly Material blood, spark, smoke, fire, toxic, dust, brass, scorch, bloodDecal, tracer, explosion;
        public int quality = 2;
        /// <summary>Camera the sprites turn to (set by GameRoot).</summary>
        public Transform cam;

        public FxSystem(Transform parent)
        {
            _root = new GameObject("Fx").transform;
            _root.SetParent(parent, false);
            // particles and decals are unit meshes scaled per instance: they keep 0..1 UVs on every face
            var mb = new MeshBuilder { unitUv = true }; mb.BoxCenter(null, Vector3.zero, Vector3.one); _cube = mb.Build("fxCube");
            mb = new MeshBuilder { unitUv = true }; mb.Floor(null, -0.5f, -0.5f, 0.5f, 0.5f, 0); _quad = mb.Build("fxQuad");
            mb = new MeshBuilder(); mb.Sphere(null, Vector3.zero, Vector3.one * 0.5f, 10, 7); _sphere = mb.Build("fxSphere");
            // sprite: unit quad in the xy plane, front face towards -z (the camera looks along +z of its own rotation)
            mb = new MeshBuilder { unitUv = true };
            mb.Quad(null, new Vector3(-0.5f, -0.5f, 0f), new Vector3(-0.5f, 0.5f, 0f), new Vector3(0.5f, 0.5f, 0f), new Vector3(0.5f, -0.5f, 0f), Vector3.back);
            _sprite = mb.Build("fxSprite");
            var white = new Color32(255, 255, 255, 255);
            _sprite.colors32 = new[] { white, white, white, white }; // particle shaders multiply the vertex colour
            // cartridge case: a short cylinder along x
            mb = new MeshBuilder(); mb.CylinderX(null, Vector3.zero, 0.3f, 1.6f, true, 6); _casing = mb.Build("fxCasing");
            brass = Mats.Lit(new Color(0.8f, 0.62f, 0.25f), 0.7f, 0.9f);

            _soft = Mats.HasParticles;
            if (_soft)
            {
                var blobs = FxTextures.Blobs;
                var bloodMist = new Style { color = new Color(0.5f, 0.05f, 0.05f), alpha = 0.35f, sizeScale = 1.5f, growth = 1.2f, drag = 4f, ambientMin = 0f };
                AddStyle(bloodMist, false, new[] { FxTextures.Soft });
                blood = AddStyle(new Style { color = new Color(0.42f, 0.02f, 0.02f), alpha = 0.95f, sizeScale = 1.4f, shrink = 0.5f, airDrag = 0.3f, spin = 120f, ambientMin = 0f, mist = bloodMist, mistChance = 0.35f }, false, blobs);
                spark = AddStyle(new Style { color = Hdr(1f, 0.75f, 0.35f, 5f), colorEnd = Hdr(1f, 0.38f, 0.1f, 1.5f), sizeScale = 0.7f, shrink = 0.5f, airDrag = 0.5f, streak = true }, true, new[] { FxTextures.Spark });
                smoke = AddStyle(new Style { color = new Color(0.34f, 0.34f, 0.34f), alpha = 0.55f, growth = 1.8f, fadeIn = 0.12f, fadePow = 1.6f, lift = 0.35f, spin = 25f, ambientMin = 0f }, false, blobs);
                fire = AddStyle(new Style { color = Hdr(1f, 0.62f, 0.25f, 2.5f), colorEnd = Hdr(0.85f, 0.17f, 0.03f, 1.2f), alpha = 0.85f, sizeScale = 2.2f, growth = 0.35f, shrink = 0.55f, fadeIn = 0.08f, lift = 1.2f, gravityScale = 0.5f, airDrag = 1f, spin = 70f, flicker = 0.45f }, true, blobs);
                toxic = AddStyle(new Style { color = new Color(0.34f, 0.86f, 0.2f), alpha = 0.32f, sizeScale = 1.7f, growth = 0.5f, fadeIn = 0.25f, fadePow = 2f, lift = 0.08f, spin = 12f, ambientMin = 0.6f, speedScale = 0.6f }, false, blobs);
                dust = AddStyle(new Style { color = new Color(0.5f, 0.44f, 0.35f), alpha = 0.5f, sizeScale = 1.7f, growth = 1.6f, fadeIn = 0.08f, fadePow = 1.5f, gravityScale = 0.15f, airDrag = 3f, drag = 2.2f, spin = 30f, ambientMin = 0f }, false, blobs);
                tracer = Mats.Particle(Hdr(1f, 0.84f, 0.55f, 5f), true, FxTextures.Tracer);
                _flashColor = Hdr(1f, 0.66f, 0.32f, 3f);
                _flashColorEnd = Hdr(0.9f, 0.3f, 0.08f, 1.5f);
                explosion = Mats.Particle(_flashColor, true, FxTextures.Fireball);
                _flashColorId = Shader.PropertyToID(Mats.TintProperty(explosion, out _flashTintScale));
            }
            else
            {
                blood = Mats.Lit(new Color(0.45f, 0.03f, 0.03f), 0.5f);
                spark = Mats.Emissive(new Color(1f, 0.85f, 0.4f), new Color(1f, 0.75f, 0.3f), 4f);
                smoke = Mats.Lit(new Color(0.35f, 0.35f, 0.35f), 0f);
                fire = Mats.Emissive(new Color(1f, 0.5f, 0.1f), new Color(1f, 0.45f, 0.08f), 4f);
                toxic = Mats.Emissive(new Color(0.35f, 0.9f, 0.2f), new Color(0.3f, 1f, 0.15f), 2.2f);
                dust = Mats.Lit(new Color(0.45f, 0.4f, 0.33f), 0f);
                tracer = Mats.Emissive(new Color(1f, 0.9f, 0.6f), new Color(1f, 0.85f, 0.5f), 5f);
                explosion = Mats.Emissive(new Color(1f, 0.6f, 0.2f), new Color(1f, 0.55f, 0.15f), 6f);
            }

            _softDecals = Mats.HasCutout;
            if (_softDecals)
            {
                // a few splat variants each; Decal picks one when a caller passes bloodDecal or scorch
                var bt = FxTextures.BloodSplats;
                _bloodSplats = new Material[bt.Length];
                for (int i = 0; i < bt.Length; i++) _bloodSplats[i] = Mats.LitCutout(_bloodColor, bt[i], 0.65f);
                var st = FxTextures.ScorchSplats;
                _scorchSplats = new Material[st.Length];
                for (int i = 0; i < st.Length; i++) _scorchSplats[i] = Mats.LitCutout(_scorchColor, st[i], 0.05f);
                bloodDecal = _bloodSplats[0];
                scorch = _scorchSplats[0];
                _decalColorId = Shader.PropertyToID(Mats.TintProperty(bloodDecal, out _));
            }
            else
            {
                scorch = Mats.Lit(new Color(0.05f, 0.045f, 0.04f), 0f);
                bloodDecal = Mats.Lit(new Color(0.3f, 0.02f, 0.02f), 0.65f);
            }
        }

        /// <summary>
        /// Additive colour with an intensity in linear light: above 1 it glows (URP renders in HDR with tonemapping and bloom).
        /// SetColor treats colours as gamma values in a linear project, so the factor is converted; the built-in fallback has no HDR.
        /// </summary>
        private static Color Hdr(float r, float g, float b, float intensity)
        {
            float k = !Mats.Urp ? 1f : QualitySettings.activeColorSpace == ColorSpace.Linear ? Mathf.LinearToGammaSpace(intensity) : intensity;
            return new Color(r * k, g * k, b * k, 1f);
        }

        /// <summary>Creates the sprite material of a style and registers it; returns the material callers pass to Emit.</summary>
        private Material AddStyle(Style s, bool additive, Texture2D[] tex)
        {
            s.tex = tex;
            if (s.colorEnd == default) s.colorEnd = s.color;
            var m = Mats.Particle(s.color, additive, tex[0]);
            if (_styles.ContainsKey(m)) m = new Material(m); // two styles must never share a material: it is their key
            s.mat = m;
            s.colorId = Shader.PropertyToID(Mats.TintProperty(m, out s.tintScale));
            s.texId = Shader.PropertyToID(Mats.TextureProperty(m));
            _styles[m] = s;
            return m;
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

        /// <param name="alpha">Opacity factor of a soft sprite. Faint particles (below 1) are skipped in the opaque fallback.</param>
        public void Emit(Vector3 pos, Vector3 vel, Material mat, float size, float life, bool gravity = true, float grow = 0f, bool sphere = false, float alpha = 1f)
        {
            if (!_soft && alpha < 1f) return;
            Style style = null;
            if (_soft && mat != null) _styles.TryGetValue(mat, out style);
            Spawn(pos, vel, mat, style, size, life, gravity, grow, sphere, alpha);
            // blood: a short, faint mist around some of the droplets
            if (style != null && style.mist != null && quality > 0 && Random.value < style.mistChance)
                Spawn(pos, vel * 0.15f, style.mist.mat, style.mist, size * 1.6f, life * 0.4f, false, 0f, false, alpha);
        }

        private void Spawn(Vector3 pos, Vector3 vel, Material mat, Style style, float size, float life, bool gravity, float grow, bool sphere, float alpha)
        {
            Particle p;
            if (_particles.Count < MaxParticles)
            {
                p = new Particle { mpb = new MaterialPropertyBlock() };
                p.t = NewObj("P", _cube, mat);
                p.r = p.t.GetComponent<Renderer>();
                p.mf = p.t.GetComponent<MeshFilter>();
                _particles.Add(p);
            }
            else
            {
                p = _particles[_nextParticle];
                _nextParticle = (_nextParticle + 1) % _particles.Count;
            }
            bool casing = style == null && mat == brass;
            var mesh = style != null ? _sprite : casing ? _casing : sphere ? _sphere : _cube;
            var material = style != null ? style.mat : mat;
            if (p.mf.sharedMesh != mesh) p.mf.sharedMesh = mesh;
            if (p.r.sharedMaterial != material) p.r.sharedMaterial = material;
            // sprites pick a texture variant; an empty block clears what a sprite left on a reused mesh particle
            p.mpb.Clear();
            if (style != null)
            {
                p.mpb.SetTexture(style.texId, style.tex[Random.Range(0, style.tex.Length)]);
                p.mpb.SetColor(style.colorId, Color.clear); // invisible until Update gives it its colour
            }
            p.r.SetPropertyBlock(p.mpb);
            p.t.gameObject.SetActive(true);
            p.t.position = pos;
            p.t.rotation = style != null ? (cam != null ? cam.rotation : Quaternion.identity) : Random.rotation;
            p.t.localScale = Vector3.one * size;
            p.style = style; p.casing = casing;
            p.v = style != null ? vel * style.speedScale : vel;
            p.life = life; p.max = life; p.size = size; p.gravity = gravity; p.grow = grow; p.alpha = alpha; p.active = true;
            p.roll = Random.Range(0f, 360f);
            p.rollSpeed = style != null ? Random.Range(-style.spin, style.spin) : casing ? Random.Range(500f, 1000f) : 0f;
            p.spinAxis = Random.onUnitSphere;
            p.phase = Random.value * 100f;
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
            // round splats: bloodDecal and scorch stand for several variants, each with a slightly different tint
            bool tinted = false;
            Color tint = default;
            if (_softDecals && (mat == bloodDecal || mat == scorch))
            {
                bool bloody = mat == bloodDecal;
                var variants = bloody ? _bloodSplats : _scorchSplats;
                mat = variants[Random.Range(0, variants.Length)];
                tint = bloody
                    ? Color.Lerp(_bloodColor, new Color(0.22f, 0.05f, 0.03f), Random.Range(0f, 0.45f)) * Random.Range(0.8f, 1.2f) // fresh to dried
                    : _scorchColor * Random.Range(0.75f, 1.3f);
                tint.a = 1f;
                tinted = true;
                size *= SplatScale;
            }
            DecalItem d;
            int max = quality <= 0 ? 60 : 160;
            if (_decals.Count < max)
            {
                d = new DecalItem { t = NewObj("Decal", _quad, mat), mpb = new MaterialPropertyBlock() };
                d.r = d.t.GetComponent<Renderer>();
                // lit splats darken in the shade like the ground around them
                d.r.receiveShadows = _softDecals;
                _decals.Add(d);
            }
            else
            {
                d = _decals[_nextDecal];
                _nextDecal = (_nextDecal + 1) % _decals.Count;
                d.r.sharedMaterial = mat;
            }
            d.t.gameObject.SetActive(true);
            d.t.position = new Vector3(pos.x, 0.012f + Random.Range(0f, 0.004f), pos.z);
            d.t.rotation = Quaternion.Euler(0, Random.Range(0f, 360f), 0);
            // splats are irregular already: less stretching than the squares
            float spread = tinted ? 0.15f : 0.3f;
            d.baseScale = new Vector3(size * Random.Range(1f - spread, 1f + spread), 1, size * Random.Range(1f - spread, 1f + spread));
            d.t.localScale = d.baseScale;
            d.life = life;
            d.tinted = tinted;
            d.color = tint;
            d.mpb.Clear();
            if (tinted) d.mpb.SetColor(_decalColorId, tint);
            d.r.SetPropertyBlock(d.mpb);
        }

        public void Explosion(Vector3 pos, float radius, bool small = false)
        {
            Flash f = null;
            foreach (var x in _flashes) if (!x.active) { f = x; break; }
            if (f == null)
            {
                // soft: an additive glow sprite; fallback: the old emissive sphere
                f = new Flash { t = NewObj("Explosion", _soft ? _sprite : _sphere, explosion), mpb = new MaterialPropertyBlock() };
                f.r = f.t.GetComponent<Renderer>();
                f.light = f.t.gameObject.AddComponent<Light>();
                f.light.type = LightType.Point;
                f.light.color = new Color(1f, 0.6f, 0.25f);
                f.light.shadows = LightShadows.None;
                _flashes.Add(f);
            }
            f.active = true;
            f.t.gameObject.SetActive(true);
            f.t.position = pos + Vector3.up * 0.6f;
            f.t.localScale = Vector3.one * 0.3f;
            f.life = f.max = small ? 0.25f : 0.4f;
            f.radius = radius;
            f.light.range = radius * 3f;
            Burst(pos + Vector3.up * 0.5f, small ? 10 : 26, fire, radius * 1.6f, 0.25f, 0.6f, true, 1.5f);
            Burst(pos + Vector3.up * 0.5f, small ? 6 : 16, smoke, radius * 0.6f, 0.6f, 1.6f, false, 1.2f);
            if (small) return;
            Decal(pos, radius * 0.9f, scorch, 60f);
            // a ring of dust rolling outwards over the ground
            if (_soft && quality > 0)
                for (int i = 0; i < 10; i++)
                {
                    var d = Quaternion.Euler(0f, i * 36f + Random.Range(-12f, 12f), 0f) * Vector3.forward;
                    Emit(new Vector3(pos.x, 0.25f, pos.z) + d * 0.4f, d * radius * Random.Range(1.6f, 2.4f), dust, 0.5f, Random.Range(0.9f, 1.3f), false, 0.5f);
                }
        }

        public void Tracer(object key, Vector3 from, Vector3 to)
        {
            if (!_tracers.TryGetValue(key, out var tr))
            {
                tr = _tracerPool.Count > 0 ? _tracerPool.Pop() : new TracerItem { t = NewObj("Tracer", _soft ? _sprite : _cube, tracer) };
                _tracers[key] = tr;
            }
            tr.from = from; tr.to = to;
            PlaceTracer(tr, cam != null ? cam.position : (from + to) * 0.5f + Vector3.up * 10f, cam != null ? cam.rotation : Quaternion.identity);
        }

        /// <summary>Soft: a glowing line along the shot that faces the camera, thin up close and never thinner than about two pixels far away.</summary>
        private void PlaceTracer(TracerItem tr, Vector3 camPos, Quaternion camRot)
        {
            var d = tr.to - tr.from;
            float len = d.magnitude;
            if (len < 0.01f) { tr.t.gameObject.SetActive(false); return; }
            tr.t.gameObject.SetActive(true);
            var mid = (tr.from + tr.to) * 0.5f;
            tr.t.position = mid;
            if (!_soft)
            {
                tr.t.rotation = Quaternion.LookRotation(d / len);
                tr.t.localScale = new Vector3(0.04f, 0.04f, len);
                return;
            }
            tr.t.rotation = Facing(mid, d / len, camPos, camRot);
            float w = Mathf.Max(TracerWidth, Vector3.Distance(camPos, mid) * TracerWidthPerMetre);
            tr.t.localScale = new Vector3(w, len, 1f);
        }

        /// <summary>Rotation of a sprite stretched along dir (its local y) whose face turns to the camera as far as it can.</summary>
        private static Quaternion Facing(Vector3 pos, Vector3 dir, Vector3 camPos, Quaternion camRot)
        {
            var away = pos - camPos;
            away -= dir * Vector3.Dot(away, dir);
            if (away.sqrMagnitude < 1e-8f) return camRot * Quaternion.FromToRotation(Vector3.up, Quaternion.Inverse(camRot) * dir); // seen end-on
            return Quaternion.LookRotation(away, dir);
        }

        /// <summary>Removes tracers whose projectile no longer exists.</summary>
        public void PruneTracers(HashSet<object> alive)
        {
            List<object> dead = null;
            foreach (var kv in _tracers) if (!alive.Contains(kv.Key)) (dead ??= new List<object>()).Add(kv.Key);
            if (dead == null) return;
            foreach (var k in dead)
            {
                var tr = _tracers[k];
                tr.t.gameObject.SetActive(false);
                _tracerPool.Push(tr);
                _tracers.Remove(k);
            }
        }

        public void Update(float dt)
        {
            _time += dt;
            // sprites and tracers turn to the camera after it moved this frame
            var camRot = cam != null ? cam.rotation : Quaternion.identity;
            var camPos = cam != null ? cam.position : Vector3.zero;
            // unlit smoke, dust and blood would glow at night: darken them with the ambient light (day 1, night about 0.3)
            float ambient = Mathf.Clamp(RenderSettings.ambientLight.grayscale * 2.2f + 0.08f, 0.2f, 1f);
            foreach (var p in _particles)
            {
                if (!p.active) continue;
                if (p.life <= 0) { p.active = false; p.t.gameObject.SetActive(false); continue; }
                // age after taking t: the spawn frame is drawn at t = 0, so short sparks show at full strength at any frame rate
                float t = 1f - p.life / p.max;
                p.life -= dt;
                if (p.style == null) UpdateMeshParticle(p, dt, t);
                else UpdateSprite(p, dt, t, camPos, camRot, ambient);
            }
            foreach (var d in _decals)
            {
                if (!d.t.gameObject.activeSelf) continue;
                d.life -= dt;
                if (d.life <= 0) { d.t.gameObject.SetActive(false); continue; }
                if (d.life >= DecalFade) continue;
                float k = d.life / DecalFade;
                if (d.tinted)
                {
                    // the splat's alpha rises from the rim to the centre: lowering it erodes the cut-out shape inwards
                    var c = d.color;
                    c.a = Mathf.Lerp(0.45f, 1f, k);
                    d.mpb.SetColor(_decalColorId, c);
                    d.r.SetPropertyBlock(d.mpb);
                }
                else d.t.localScale = new Vector3(d.baseScale.x * k, 1f, d.baseScale.z * k);
            }
            foreach (var f in _flashes)
            {
                if (!f.active) continue;
                f.life -= dt;
                if (f.life <= 0) { f.active = false; f.t.gameObject.SetActive(false); continue; }
                float k = 1 - f.life / f.max;
                f.light.intensity = 14f * (1 - k);
                if (!_soft)
                {
                    f.t.localScale = Vector3.one * Mathf.Lerp(0.3f, f.radius * 1.4f, Mathf.Sqrt(k)) * (1 - k * 0.5f);
                    continue;
                }
                float size = Mathf.Lerp(0.4f, f.radius * 2.4f, Mathf.Sqrt(k)) * (1f - k * 0.4f);
                float a = 1f - k * k;
                if (cam != null)
                {
                    // camera inside the blast: a glow in front of the eye instead of a wall of fire over the whole screen
                    float dist = Vector3.Distance(camPos, f.t.position);
                    size = Mathf.Min(size, Mathf.Max(0.25f, dist * 0.9f));
                    a *= Mathf.Lerp(0.4f, 1f, Mathf.Clamp01(dist / Mathf.Max(0.5f, f.radius)));
                }
                f.t.rotation = camRot;
                f.t.localScale = new Vector3(size, size, 1f);
                var c = Color.Lerp(_flashColor, _flashColorEnd, k);
                c.a = a;
                f.mpb.SetColor(_flashColorId, c * _flashTintScale);
                f.r.SetPropertyBlock(f.mpb);
            }
            if (_soft) foreach (var tr in _tracers.Values) PlaceTracer(tr, camPos, camRot);
        }

        /// <summary>Old behaviour for opaque mesh particles (fallback, casings): shrink while flying; casings tumble.</summary>
        private static void UpdateMeshParticle(Particle p, float dt, float t)
        {
            if (p.gravity) p.v.y -= 9.81f * dt;
            else p.v *= Mathf.Exp(-1.5f * dt);
            var pos = p.t.position + p.v * dt;
            if (pos.y < 0.02f) { pos.y = 0.02f; p.v *= 0.3f; p.v.y = 0; p.rollSpeed *= 0.5f; }
            p.t.position = pos;
            if (p.rollSpeed > 1f) p.t.Rotate(p.spinAxis, p.rollSpeed * dt, Space.World);
            float k = 1f - t;
            // casings keep their size until shortly before they vanish
            p.t.localScale = Vector3.one * (p.size * (p.casing ? Mathf.Min(1f, k * 5f) : 0.3f + 0.7f * k) + p.grow * t);
        }

        private void UpdateSprite(Particle p, float dt, float t, Vector3 camPos, Quaternion camRot, float ambient)
        {
            var s = p.style;
            if (p.gravity) { p.v.y -= 9.81f * s.gravityScale * dt; p.v *= Mathf.Exp(-s.airDrag * dt); }
            else p.v *= Mathf.Exp(-s.drag * dt);
            p.v.y += s.lift * dt;
            float size = (p.size * (1f - s.shrink * t + s.growth * t) + p.grow * t) * s.sizeScale;
            float a = p.alpha * s.alpha * (1f - Mathf.Pow(t, s.fadePow));
            if (s.fadeIn > 0f) a *= Mathf.Clamp01(t / s.fadeIn);
            if (s.flicker > 0f)
            {
                float n = Mathf.PerlinNoise(p.phase, _time * 9f);
                a *= 1f - s.flicker + 2f * s.flicker * n;
                size *= 0.88f + 0.24f * n;
            }
            var pos = p.t.position + p.v * dt;
            // round sprites rest on the ground instead of sinking half into it
            float floor = s.streak ? 0.02f : Mathf.Max(0.02f, size * 0.3f);
            if (pos.y < floor) { pos.y = floor; p.v *= 0.3f; p.v.y = 0; }
            p.t.position = pos;
            if (s.streak)
            {
                // sparks: stretched along the flight, longer the faster they are
                float speed = p.v.magnitude;
                p.t.rotation = Facing(pos, speed > 0.01f ? p.v / speed : Vector3.up, camPos, camRot);
                p.t.localScale = new Vector3(size, size * 2f + speed * StreakTime, 1f);
            }
            else
            {
                p.roll += p.rollSpeed * dt;
                p.t.rotation = camRot * Quaternion.Euler(0f, 0f, p.roll);
                p.t.localScale = new Vector3(size, size, 1f);
            }
            var c = Color.Lerp(s.color, s.colorEnd, t);
            if (s.ambientMin < 1f)
            {
                float l = Mathf.Max(ambient, s.ambientMin);
                c.r *= l; c.g *= l; c.b *= l;
            }
            c.a = Mathf.Clamp01(a);
            p.mpb.SetColor(s.colorId, c * s.tintScale);
            p.r.SetPropertyBlock(p.mpb);
        }

        public void Clear()
        {
            foreach (var p in _particles) { p.active = false; p.t.gameObject.SetActive(false); }
            foreach (var d in _decals) d.t.gameObject.SetActive(false);
            foreach (var f in _flashes) { f.active = false; f.t.gameObject.SetActive(false); }
            foreach (var tr in _tracers.Values) { tr.t.gameObject.SetActive(false); _tracerPool.Push(tr); }
            _tracers.Clear();
        }
    }
}
