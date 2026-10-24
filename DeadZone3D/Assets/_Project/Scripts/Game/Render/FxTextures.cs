using System;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>
    /// Textures of the effects, generated at runtime (no asset files). Sprites are white with the shape in alpha, so the
    /// material colour tints them: a round glow, cloudy blobs (smoke, dust, toxic gas, fire, blood mist), a spark streak, a
    /// tracer line and a fireball. Splats are irregular blood and scorch marks for the alpha-clipped decals; their alpha is
    /// 0.5 exactly at the edge and rises towards the centre, so lowering the material alpha erodes them from the rim inwards.
    /// Generated on first use and cached; regenerated if Unity unloaded them.
    /// </summary>
    public static class FxTextures
    {
        public const int SpriteSize = 64, SplatSize = 128;
        private const int BlobCount = 3, BloodCount = 4, ScorchCount = 3;

        private static Texture2D _soft, _spark, _tracer, _fireball;
        private static readonly Texture2D[] BlobCache = new Texture2D[BlobCount];
        private static readonly Texture2D[] BloodCache = new Texture2D[BloodCount];
        private static readonly Texture2D[] ScorchCache = new Texture2D[ScorchCount];

        /// <summary>Round sprite with a smooth radial falloff.</summary>
        public static Texture2D Soft => _soft != null ? _soft : _soft = Make("DZFx_Soft", SpriteSize, GenSoft(SpriteSize), false);
        /// <summary>Streak along v (the sprite's long axis), brightest in the middle.</summary>
        public static Texture2D Spark => _spark != null ? _spark : _spark = Make("DZFx_Spark", SpriteSize, GenSpark(SpriteSize), false);
        /// <summary>Thin hot core with a soft glow around it, fading out towards the tail at v = 0.</summary>
        public static Texture2D Tracer => _tracer != null ? _tracer : _tracer = Make("DZFx_Tracer", SpriteSize, GenTracer(SpriteSize), false);
        /// <summary>Bright round core with lumpy edges (explosion flash).</summary>
        public static Texture2D Fireball => _fireball != null ? _fireball : _fireball = Make("DZFx_Fireball", SpriteSize, GenBlob(SpriteSize, 977u, 0.35f), false);

        /// <summary>Cloudy round blobs in a few variants.</summary>
        public static Texture2D[] Blobs => Fill(BlobCache, i => Make("DZFx_Blob" + i, SpriteSize, GenBlob(SpriteSize, 11u + (uint)i * 7919u, 0f), false));
        /// <summary>Blood splats: a pool with ragged edges and droplets around it.</summary>
        public static Texture2D[] BloodSplats => Fill(BloodCache, i => Make("DZFx_Blood" + i, SplatSize, GenBlood(SplatSize, 101u + (uint)i * 104729u), true));
        /// <summary>Scorch marks: a dark centre with soot rays.</summary>
        public static Texture2D[] ScorchSplats => Fill(ScorchCache, i => Make("DZFx_Scorch" + i, SplatSize, GenScorch(SplatSize, 503u + (uint)i * 15485863u), true));

        private static Texture2D[] Fill(Texture2D[] cache, Func<int, Texture2D> make)
        {
            for (int i = 0; i < cache.Length; i++) if (cache[i] == null) cache[i] = make(i);
            return cache;
        }

        /// <summary>Grey value and alpha of a generated texture, Size x Size, row 0 = v 0.</summary>
        public struct Pixels { public float[] lum, alpha; }

        private static Texture2D Make(string name, int size, Pixels p, bool splat)
        {
            var px = new Color32[size * size];
            for (int i = 0; i < px.Length; i++)
            {
                byte l = (byte)Math.Round(Clamp01(p.lum[i]) * 255f), a = (byte)Math.Round(Clamp01(p.alpha[i]) * 255f);
                px[i] = new Color32(l, l, l, a);
            }
            // linear: the grey value is a shading factor on the material colour, not a colour of its own
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true, true)
            {
                name = name,
                filterMode = FilterMode.Trilinear,
                // decals are seen at grazing angles in first person
                anisoLevel = splat ? 4 : 1,
                wrapMode = TextureWrapMode.Clamp,
            };
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }

        // ------------------------------------------------------------------ generation (plain C#, no Unity calls)
        public static Pixels GenSoft(int size)
        {
            var p = New(size, 1f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float r2 = R2(x, y, size);
                    float a = r2 < 1f ? (1f - r2) * (1f - r2) : 0f;
                    p.alpha[y * size + x] = a;
                }
            return p;
        }

        /// <param name="core">Extra brightness in the middle (fireball).</param>
        public static Pixels GenBlob(int size, uint seed, float core)
        {
            var p = New(size, 1f);
            var rng = new Xs(seed);
            // a few overlapping puffs make the cloud lumpy
            int n = 5;
            var px = new float[n]; var py = new float[n]; var pr = new float[n];
            for (int i = 0; i < n; i++)
            {
                float ang = rng.Next() * 6.2832f, d = i == 0 ? 0f : 0.15f + rng.Next() * 0.25f;
                px[i] = (float)Math.Cos(ang) * d; py[i] = (float)Math.Sin(ang) * d;
                pr[i] = i == 0 ? 0.6f : 0.3f + rng.Next() * 0.2f;
            }
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size * 2f - 1f, v = (y + 0.5f) / size * 2f - 1f;
                    float dens = 0f;
                    for (int i = 0; i < n; i++)
                    {
                        float dx = (u - px[i]) / pr[i], dy = (v - py[i]) / pr[i];
                        dens += (float)Math.Exp(-(dx * dx + dy * dy) * 1.3f);
                    }
                    float r2 = u * u + v * v;
                    float window = r2 < 1f ? (float)Math.Pow(1f - r2, 1.5) : 0f;
                    float nz = Fbm(u * 2.5f + 7f, v * 2.5f + 3f, seed);
                    float a = Clamp01(dens * 0.75f) * window * (0.55f + 0.6f * nz);
                    if (core > 0f) a = Clamp01(a + core * window * window);
                    int i0 = y * size + x;
                    p.alpha[i0] = Clamp01(a * 1.25f);
                    // billowy shading: a second noise darkens parts of the cloud
                    p.lum[i0] = 0.74f + 0.26f * Fbm(u * 3f + 19f, v * 3f + 5f, seed + 3u);
                }
            return p;
        }

        public static Pixels GenSpark(int size)
        {
            var p = New(size, 1f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float du = ((x + 0.5f) / size - 0.5f) * 2f, v = (y + 0.5f) / size;
                    float across = (float)Math.Exp(-(du / 0.3f) * (du / 0.3f));
                    float along = (float)Math.Sin(v * Math.PI);
                    p.alpha[y * size + x] = across * along;
                }
            return p;
        }

        public static Pixels GenTracer(int size)
        {
            var p = New(size, 1f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float du = ((x + 0.5f) / size - 0.5f) * 2f, v = (y + 0.5f) / size;
                    float core = (float)Math.Exp(-(du / 0.16f) * (du / 0.16f)), glow = 0.3f * (float)Math.Exp(-(du / 0.5f) * (du / 0.5f));
                    // long tail, short rounded head
                    float along = (float)Math.Pow(v, 0.8) * SmoothStep(1f, 0.92f, v);
                    float edge = Math.Abs(du) > 0.94f ? 0f : 1f;
                    p.alpha[y * size + x] = Clamp01((core + glow) * along) * edge;
                }
            return p;
        }

        public static Pixels GenBlood(int size, uint seed)
        {
            var p = New(size, 1f);
            var rng = new Xs(seed);
            // pool: radius with a ragged outline (low harmonics) around a slightly off-centre middle
            float r0 = 0.36f + rng.Next() * 0.1f, cx = (rng.Next() - 0.5f) * 0.1f, cy = (rng.Next() - 0.5f) * 0.1f;
            var harm = Harmonics(ref rng, 3, 11, 0.04f, 0.1f);
            // droplets and short streaks thrown outwards
            int drops = 7 + (int)(rng.Next() * 7);
            var dx = new float[drops]; var dy = new float[drops]; var dr = new float[drops]; var dl = new float[drops];
            for (int i = 0; i < drops; i++)
            {
                float ang = rng.Next() * 6.2832f, d = r0 + 0.08f + rng.Next() * (0.88f - r0 - 0.08f);
                dx[i] = cx + (float)Math.Cos(ang) * d; dy[i] = cy + (float)Math.Sin(ang) * d;
                dr[i] = 0.018f + rng.Next() * 0.045f * (1f - d * 0.6f);
                dl[i] = rng.Next() < 0.4f ? 1.8f + rng.Next() * 1.6f : 1f; // stretched along the throw direction
            }
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size * 2f - 1f, v = (y + 0.5f) / size * 2f - 1f;
                    float ux = u - cx, vy = v - cy;
                    float r = (float)Math.Sqrt(ux * ux + vy * vy), th = (float)Math.Atan2(vy, ux);
                    // signed depth inside the shape (positive inside), in units of half the texture
                    float s = r0 * Radius(harm, th) - r;
                    for (int i = 0; i < drops; i++)
                    {
                        float ex = u - dx[i], ey = v - dy[i];
                        // the droplet's long axis points away from the pool
                        float ax = dx[i] - cx, ay = dy[i] - cy, al = (float)Math.Sqrt(ax * ax + ay * ay) + 1e-5f;
                        ax /= al; ay /= al;
                        float along = (ex * ax + ey * ay) / dl[i], across = -ex * ay + ey * ax;
                        float sd = dr[i] - (float)Math.Sqrt(along * along + across * across);
                        if (sd > s) s = sd;
                    }
                    s += (Fbm(u * 9f, v * 9f, seed) - 0.5f) * 0.05f;
                    int k = y * size + x;
                    p.alpha[k] = SplatAlpha(s, u, v);
                    // wet pool: mottled, a little darker at the rim
                    p.lum[k] = (0.78f + 0.22f * Fbm(u * 5f + 3f, v * 5f, seed + 9u)) * (0.82f + 0.18f * SmoothStep(0f, 0.08f, s));
                }
            return p;
        }

        public static Pixels GenScorch(int size, uint seed)
        {
            var p = New(size, 1f);
            var rng = new Xs(seed);
            float r0 = 0.5f + rng.Next() * 0.12f;
            var harm = Harmonics(ref rng, 3, 7, 0.04f, 0.08f);
            var rays = Harmonics(ref rng, 9, 19, 0.04f, 0.1f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size * 2f - 1f, v = (y + 0.5f) / size * 2f - 1f;
                    float r = (float)Math.Sqrt(u * u + v * v), th = (float)Math.Atan2(v, u);
                    // soot rays: the absolute value of high harmonics gives sharp spikes
                    float spikes = Math.Abs(Radius(rays, th) - 1f) * 2.2f;
                    float s = r0 * (Radius(harm, th) * 0.78f + spikes * 0.5f) - r;
                    s += (Fbm(u * 10f, v * 10f, seed) - 0.5f) * 0.1f;
                    int k = y * size + x;
                    p.alpha[k] = SplatAlpha(s, u, v);
                    // charred black in the middle, brown-grey soot towards the rim, speckled
                    float rim = Clamp01(r / (r0 * 0.9f));
                    p.lum[k] = (0.3f + 0.7f * rim * rim) * (0.8f + 0.2f * Fbm(u * 7f + 11f, v * 7f, seed + 5u));
                }
            return p;
        }

        /// <summary>
        /// Alpha of a splat from its signed depth s: 0.5 at the edge, rising inwards (decals fade by eroding from the rim),
        /// cut to zero before the texture border so the clamped edge pixels stay empty.
        /// </summary>
        private static float SplatAlpha(float s, float u, float v)
        {
            float r2 = u * u + v * v;
            float window = Clamp01((0.96f - (float)Math.Sqrt(r2)) * 25f);
            return Clamp01(0.5f + s * 2.2f) * window;
        }

        private struct Harm { public int k; public float amp, phase; }

        private static Harm[] Harmonics(ref Xs rng, int kMin, int kMax, float ampMin, float ampMax)
        {
            var h = new Harm[kMax - kMin + 1];
            for (int i = 0; i < h.Length; i++)
                h[i] = new Harm { k = kMin + i, amp = (ampMin + rng.Next() * (ampMax - ampMin)) / (1f + i * 0.35f), phase = rng.Next() * 6.2832f };
            return h;
        }

        /// <summary>Relative radius (around 1) of a ragged outline at angle th.</summary>
        private static float Radius(Harm[] h, float th)
        {
            float r = 1f;
            foreach (var x in h) r += x.amp * (float)Math.Sin(x.k * th + x.phase);
            return r;
        }

        private static Pixels New(int size, float lum)
        {
            var p = new Pixels { lum = new float[size * size], alpha = new float[size * size] };
            for (int i = 0; i < p.lum.Length; i++) p.lum[i] = lum;
            return p;
        }

        /// <summary>Squared distance of a pixel centre from the middle, 1 at the middle of the edges.</summary>
        private static float R2(int x, int y, int size)
        {
            float u = (x + 0.5f) / size * 2f - 1f, v = (y + 0.5f) / size * 2f - 1f;
            return u * u + v * v;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;

        private static float SmoothStep(float e0, float e1, float x)
        {
            float t = Clamp01((x - e0) / (e1 - e0));
            return t * t * (3f - 2f * t);
        }

        /// <summary>Smooth value noise 0..1 (three octaves).</summary>
        private static float Fbm(float x, float y, uint seed) =>
            0.55f * Noise(x, y, seed) + 0.3f * Noise(x * 2.1f + 5.3f, y * 2.1f + 1.7f, seed + 17u) + 0.15f * Noise(x * 4.3f + 9.1f, y * 4.3f + 3.9f, seed + 31u);

        private static float Noise(float x, float y, uint seed)
        {
            int xi = (int)Math.Floor(x), yi = (int)Math.Floor(y);
            float fx = x - xi, fy = y - yi;
            float u = fx * fx * (3f - 2f * fx), v = fy * fy * (3f - 2f * fy);
            float a = Rand01(xi, yi, seed), b = Rand01(xi + 1, yi, seed), c = Rand01(xi, yi + 1, seed), d = Rand01(xi + 1, yi + 1, seed);
            return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
        }

        private static float Rand01(int x, int y, uint seed)
        {
            uint h = (uint)x * 374761393u + (uint)y * 668265263u + seed * 2246822519u;
            h = (h ^ (h >> 13)) * 1274126177u;
            h ^= h >> 16;
            return (h >> 8) / 16777216f;
        }

        /// <summary>Small xorshift generator for the texture shapes (separate from the simulation's random numbers).</summary>
        private struct Xs
        {
            private uint _s;
            public Xs(uint seed) { _s = seed * 2654435761u + 0x9E3779B9u; if (_s == 0) _s = 1; }
            public float Next()
            {
                _s ^= _s << 13; _s ^= _s >> 17; _s ^= _s << 5;
                return (_s >> 8) / 16777216f;
            }
        }
    }
}
