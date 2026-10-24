using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>
    /// The sky seen in first person: an inside-out sphere that follows the camera, coloured by a vertical gradient whose
    /// horizon is exactly the fog colour (fogged geometry in the distance blends into it), with a sun disc by day and a
    /// moon disc and stars at night. It is drawn first (Background queue) and writes no depth, so everything else covers
    /// it. Meshes and textures are generated here; LightingRig.Apply provides the colours.
    /// Needs the URP Unlit shader; without it the camera keeps clearing to the fog colour as before.
    /// </summary>
    public sealed class SkyDome
    {
        // close to the camera so the fog barely tints the sky; it writes no depth, so its size does not matter otherwise
        private const float Radius = 10f;
        private const int GradientSize = 128, HorizonRow = GradientSize / 2;
        /// <summary>Height of the dusk/dawn band above the horizon (0..1 of the way to the zenith, ~6 degrees).</summary>
        private const float GlowPeak = 0.07f;
        /// <summary>Half the angular size of the sun and moon quads (degrees); the discs fill the inner part.</summary>
        private const float SunQuad = 6.25f, MoonQuad = 2.4f;
        private const int StarCount = 420;

        private readonly bool _supported;
        private readonly Transform _root, _sun, _moon;
        private readonly Renderer _sunR, _moonR, _starsR;
        private readonly Texture2D _gradient;
        private readonly Color32[] _pixels = new Color32[GradientSize];
        private readonly MaterialPropertyBlock _block = new MaterialPropertyBlock();
        private Color _bakedH, _bakedZ, _bakedG;
        private float _sinceBake;
        private bool _baked;

        public SkyDome(Transform parent)
        {
            _root = new GameObject("Sky").transform;
            _root.SetParent(parent, false);
            var template = Mats.Unlit(Color.white);
            // texture, depth writing and blending must be material properties (URP Unlit); the built-in fallback has none
            _supported = template.HasProperty("_BaseMap") && template.HasProperty("_ZWrite") && template.HasProperty("_SrcBlend");
            if (!_supported) { _root.gameObject.SetActive(false); return; }

            _gradient = NewTexture(1, GradientSize, false, false, "SkyGradient");
            Child("Dome", DomeMesh(32, 24), SkyMaterial(template, _gradient, 1000, false)).localScale = Vector3.one * Radius;
            _starsR = Child("Stars", StarMesh(), SkyMaterial(template, StarTexture(), 1001, true)).GetComponent<Renderer>();
            var quad = QuadMesh();
            _moon = Child("Moon", quad, SkyMaterial(template, MoonTexture(), 1002, true));
            _moonR = _moon.GetComponent<Renderer>();
            _sun = Child("Sun", quad, SkyMaterial(template, SunTexture(), 1003, true));
            _sunR = _sun.GetComponent<Renderer>();
        }

        /// <summary>Moves the sky to the camera and shows the lighting applied this frame. Call once per frame after LightingRig.Apply.</summary>
        public void Update(Vector3 cameraPosition, LightingRig lighting, float dt)
        {
            if (!_supported) return;
            // world-aligned, so the children's local positions are directions in the world
            _root.SetPositionAndRotation(cameraPosition, Quaternion.identity);
            _sinceBake += dt;
            Color h = lighting.skyHorizon, z = lighting.skyZenith, g = lighting.skyGlow;
            float change = Mathf.Max(Diff(h, _bakedH), Mathf.Max(Diff(z, _bakedZ), Diff(g, _bakedG)));
            // regenerated when the colours change noticeably, at most every 0.25 s; at once after a jump (new raid, menu)
            if (!_baked || change > 0.05f || (change > 0.5f / 255f && _sinceBake >= 0.25f)) Bake(h, z, g);

            // the sun and the moon sit where the directional light comes from; neither shows in the short gap at dusk
            float day = lighting.daylight;
            var dir = -lighting.sun.transform.forward;
            float sunVis = Smooth(0.35f, 0.6f, day), moonVis = 1f - Smooth(0.08f, 0.3f, day), starVis = 1f - Smooth(0.05f, 0.35f, day);
            Place(_sun, _sunR, dir, SunQuad, lighting.sun.color * (1.9f * sunVis));
            Place(_moon, _moonR, dir, MoonQuad, new Color(0.82f, 0.87f, 1f) * (1.08f * moonVis));
            _starsR.enabled = starVis > 0.002f;
            if (_starsR.enabled) SetTint(_starsR, new Color(starVis, starVis, starVis, 1f));
        }

        // ------------------------------------------------------------------ colours

        /// <summary>Fills the gradient: rows up to the horizon are exactly the fog colour, above it the colour eases towards the zenith.</summary>
        private void Bake(Color horizon, Color zenith, Color glow)
        {
            _bakedH = horizon; _bakedZ = zenith; _bakedG = glow;
            _baked = true;
            _sinceBake = 0f;
            for (int i = 0; i < GradientSize; i++)
            {
                // row 0 = straight down, HorizonRow = just above the horizon (v = 0.5 lies between the two middle rows)
                float t = Mathf.Clamp01((i - HorizonRow) / (float)(GradientSize - 1 - HorizonRow));
                float k = 1f - Mathf.Pow(1f - t, 2.2f);
                float band = t / GlowPeak * Mathf.Exp(1f - t / GlowPeak);
                var c = Color.Lerp(horizon, zenith, k);
                c = new Color(c.r + glow.r * band, c.g + glow.g * band, c.b + glow.b * band, 1f);
                _pixels[i] = c;
            }
            _gradient.SetPixels32(_pixels);
            _gradient.Apply(false);
        }

        private static float Diff(Color a, Color b) => Mathf.Max(Mathf.Abs(a.r - b.r), Mathf.Max(Mathf.Abs(a.g - b.g), Mathf.Abs(a.b - b.b)));

        private static float Smooth(float edge0, float edge1, float x)
        {
            float t = Mathf.Clamp01((x - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        private void Place(Transform t, Renderer r, Vector3 dir, float halfDeg, Color tint)
        {
            r.enabled = tint.maxColorComponent > 0.002f && dir.y > -0.05f;
            if (!r.enabled) return;
            float dist = Radius * 0.9f;
            t.localPosition = dir * dist;
            // local -z (the front of the quad) faces the camera
            t.localRotation = Quaternion.LookRotation(dir, Mathf.Abs(dir.y) > 0.99f ? Vector3.forward : Vector3.up);
            t.localScale = Vector3.one * (dist * Mathf.Tan(halfDeg * Mathf.Deg2Rad));
            tint.a = 1f;
            SetTint(r, tint);
        }

        /// <summary>
        /// Colour multiplier per renderer. The property block also keeps the sky away from the GPU Resident Drawer,
        /// which might not honour the disabled depth passes of the materials.
        /// </summary>
        private void SetTint(Renderer r, Color c)
        {
            _block.Clear();
            _block.SetColor("_BaseColor", c);
            r.SetPropertyBlock(_block);
        }

        // ------------------------------------------------------------------ setup

        private static Material SkyMaterial(Material template, Texture texture, int queue, bool additive)
        {
            var m = new Material(template) { name = "Sky" + queue };
            m.SetTexture("_BaseMap", texture);
            m.SetColor("_BaseColor", Color.white);
            m.SetFloat("_ZWrite", 0f);
            if (m.HasProperty("_Cull")) m.SetFloat("_Cull", (float)CullMode.Off);
            if (additive)
            {
                // sun, moon and stars add their light to the sky: black texels leave it unchanged, no alpha needed
                m.SetFloat("_SrcBlend", (float)BlendMode.One);
                m.SetFloat("_DstBlend", (float)BlendMode.One);
            }
            // keep the sky out of the depth prepasses (SSAO): there it would hide everything beyond its radius
            m.SetShaderPassEnabled("DepthOnly", false);
            m.SetShaderPassEnabled("DepthNormalsOnly", false);
            m.SetShaderPassEnabled("DepthNormals", false);
            m.SetShaderPassEnabled("MotionVectors", false);
            m.SetShaderPassEnabled("ShadowCaster", false);
            m.renderQueue = queue;
            return m;
        }

        private Transform Child(string name, Mesh mesh, Material mat)
        {
            // set up while inactive: the renderer has its property block before the pipeline first sees it
            var go = new GameObject(name);
            go.SetActive(false);
            go.transform.SetParent(_root, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = LightProbeUsage.Off;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            r.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            SetTint(r, Color.white);
            go.SetActive(true);
            return go.transform;
        }

        private static Texture2D NewTexture(int w, int h, bool linear, bool mips, string name)
        {
            return new Texture2D(w, h, TextureFormat.RGBA32, mips, linear)
            {
                name = name,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = mips ? FilterMode.Trilinear : FilterMode.Bilinear,
            };
        }

        /// <summary>Unit sphere seen from inside; v = elevation (0 straight down, 0.5 horizon, 1 zenith). lat must be even (a ring on the horizon).</summary>
        private static Mesh DomeMesh(int lon, int lat)
        {
            var verts = new Vector3[(lon + 1) * (lat + 1)];
            var normals = new Vector3[verts.Length];
            var uvs = new Vector2[verts.Length];
            for (int y = 0; y <= lat; y++)
            {
                float v = (float)y / lat, elev = (v - 0.5f) * Mathf.PI;
                float ring = Mathf.Cos(elev), height = Mathf.Sin(elev);
                for (int x = 0; x <= lon; x++)
                {
                    float a = (float)x / lon * Mathf.PI * 2f;
                    int i = y * (lon + 1) + x;
                    verts[i] = new Vector3(Mathf.Cos(a) * ring, height, Mathf.Sin(a) * ring);
                    normals[i] = -verts[i];
                    uvs[i] = new Vector2((float)x / lon, v);
                }
            }
            var tris = new int[lon * lat * 6];
            int k = 0;
            for (int y = 0; y < lat; y++)
                for (int x = 0; x < lon; x++)
                {
                    // b is the same column one ring higher; wound so the front faces point to the centre
                    int a = y * (lon + 1) + x, b = a + lon + 1;
                    tris[k++] = a; tris[k++] = a + 1; tris[k++] = b;
                    tris[k++] = a + 1; tris[k++] = b + 1; tris[k++] = b;
                }
            var mesh = new Mesh { name = "SkyDome", vertices = verts, normals = normals, uv = uvs, triangles = tris };
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>Quad from -1 to 1 in the XY plane, front face towards -z.</summary>
        private static Mesh QuadMesh()
        {
            var mb = new MeshBuilder();
            mb.Quad(null, new Vector3(-1, -1, 0), new Vector3(-1, 1, 0), new Vector3(1, 1, 0), new Vector3(1, -1, 0), Vector3.back);
            return mb.Build("SkyQuad");
        }

        /// <summary>Tiny quads facing the centre, spread evenly over the sky above ~6 degrees (lower down the haze hides them).</summary>
        private static Mesh StarMesh()
        {
            var rng = new System.Random(7919);
            var verts = new Vector3[StarCount * 4];
            var normals = new Vector3[verts.Length];
            var uvs = new Vector2[verts.Length];
            var tris = new int[StarCount * 6];
            float dist = Radius * 0.96f;
            for (int s = 0; s < StarCount; s++)
            {
                float y = Mathf.Lerp(0.1f, 1f, (float)rng.NextDouble());
                float a = (float)rng.NextDouble() * Mathf.PI * 2f, ring = Mathf.Sqrt(1f - y * y);
                var d = new Vector3(Mathf.Cos(a) * ring, y, Mathf.Sin(a) * ring);
                // four brightness tiers in the texture; bright stars are rare and a little larger
                double pick = rng.NextDouble();
                int tier = pick < 0.07 ? 0 : pick < 0.25 ? 1 : pick < 0.55 ? 2 : 3;
                float sizeDeg = Mathf.Lerp(0.36f, 0.2f, tier / 3f) * Mathf.Lerp(0.85f, 1.15f, (float)rng.NextDouble());
                float half = dist * Mathf.Tan(sizeDeg * 0.5f * Mathf.Deg2Rad);
                var right = Vector3.Cross(Vector3.up, d);
                right = right.sqrMagnitude > 1e-6f ? right.normalized : Vector3.right;
                var up = Vector3.Cross(d, right) * half;
                right *= half;
                var c = d * dist;
                int i = s * 4;
                verts[i] = c - right - up; verts[i + 1] = c - right + up; verts[i + 2] = c + right + up; verts[i + 3] = c + right - up;
                float u0 = tier / 4f, u1 = (tier + 1) / 4f;
                uvs[i] = new Vector2(u0, 0); uvs[i + 1] = new Vector2(u0, 1); uvs[i + 2] = new Vector2(u1, 1); uvs[i + 3] = new Vector2(u1, 0);
                for (int n = 0; n < 4; n++) normals[i + n] = -d;
                int k = s * 6;
                tris[k] = i; tris[k + 1] = i + 1; tris[k + 2] = i + 2;
                tris[k + 3] = i; tris[k + 4] = i + 2; tris[k + 5] = i + 3;
            }
            var mesh = new Mesh { name = "SkyStars", vertices = verts, normals = normals, uv = uvs, triangles = tris };
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>Four soft dots side by side (16x16 each) with falling brightness and slightly different tints.</summary>
        private static Texture2D StarTexture()
        {
            const int cell = 16, w = cell * 4;
            float[] peak = { 0.85f, 0.55f, 0.36f, 0.22f };
            Color[] tint = { new Color(0.85f, 0.92f, 1f), Color.white, new Color(1f, 0.9f, 0.78f), new Color(0.9f, 0.94f, 1f) };
            float floor = Mathf.Exp(-4f);
            var px = new Color32[w * cell];
            for (int y = 0; y < cell; y++)
                for (int x = 0; x < w; x++)
                {
                    int tier = x / cell;
                    float dx = (x % cell + 0.5f) / cell * 2f - 1f, dy = (y + 0.5f) / cell * 2f - 1f;
                    float f = Mathf.Max(0f, Mathf.Exp(-(dx * dx + dy * dy) * 4f) - floor) / (1f - floor) * peak[tier];
                    px[y * w + x] = new Color(tint[tier].r * f, tint[tier].g * f, tint[tier].b * f, 1f);
                }
            // mipmaps: the dots are only a few pixels big on screen and would flicker without them
            var tex = NewTexture(w, cell, true, true, "SkyStars");
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>Grey moon disc with darker seas and limb darkening, surrounded by a faint glow.</summary>
        private static Texture2D MoonTexture()
        {
            const int n = 64;
            const float disc = 0.5f, texel = 2f / n;
            // seas: centre x, y and radius relative to the disc, and how much darker
            var seas = new[] { new Vector4(-0.3f, 0.25f, 0.32f, 0.2f), new Vector4(0.22f, 0.32f, 0.22f, 0.16f), new Vector4(0.08f, -0.22f, 0.34f, 0.18f), new Vector4(-0.38f, -0.34f, 0.16f, 0.12f) };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = (x + 0.5f) * texel - 1f, dy = (y + 0.5f) * texel - 1f, r = Mathf.Sqrt(dx * dx + dy * dy);
                    float inside = 1f - Smooth(disc - texel * 1.5f, disc, r);
                    float sx = dx / disc, sy = dy / disc, shade = 0.95f - 0.25f * (sx * sx + sy * sy);
                    foreach (var s in seas)
                    {
                        float ex = (sx - s.x) / s.z, ey = (sy - s.y) / s.z;
                        shade -= s.w * Mathf.Exp(-(ex * ex + ey * ey) * 1.5f);
                    }
                    float glow = 0.06f * Mathf.Exp(-Mathf.Max(0f, r - disc) * 9f) * (1f - Smooth(0.75f, 1f, r));
                    float v = inside * shade + (1f - inside) * glow;
                    px[y * n + x] = new Color(v, v, v, 1f);
                }
            var tex = NewTexture(n, n, true, true, "SkyMoon");
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>Bright sun disc with a soft halo that fades out before the edge of the quad.</summary>
        private static Texture2D SunTexture()
        {
            const int n = 128;
            const float core = 0.16f, texel = 2f / n;
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = (x + 0.5f) * texel - 1f, dy = (y + 0.5f) * texel - 1f, r = Mathf.Sqrt(dx * dx + dy * dy);
                    float disc = 1f - Smooth(core - 0.02f, core + 0.005f, r);
                    float halo = 0.12f * Mathf.Exp(-Mathf.Max(0f, r - core) * 6f) * (1f - Smooth(0.7f, 1f, r));
                    float v = disc + (1f - disc) * halo;
                    px[y * n + x] = new Color(v, v, v, 1f);
                }
            var tex = NewTexture(n, n, true, true, "SkySun");
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }
    }
}
