using System;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>
    /// Tileable detail textures generated at runtime (no asset files): light grey surface patterns that are multiplied with a
    /// material's base colour (Mats.Lit). 256 x 256 with mipmaps; one repeat covers 2 m (MeshBuilder's planar UVs).
    /// Each texture is generated on first use and cached; the static cache resets with the domain reload.
    /// </summary>
    public static class ProceduralTextures
    {
        public enum Kind { Asphalt, Concrete, Dirt, Grass, Gravel, Plaster, Brick, Wood, Tiles, Metal, Fabric }

        public const int Size = 256;
        /// <summary>Average brightness of every texture; Mats.Lit brightens the base colour by 1/Mean so materials keep their tuned look.</summary>
        public const float Mean = 0.87f;
        /// <summary>Darkest value (cracks, joints).</summary>
        private const float Low = 0.62f;
        private const int Mask = Size - 1;

        private static readonly Texture2D[] Cache = new Texture2D[(int)Kind.Fabric + 1];

        public static Texture2D Asphalt => Get(Kind.Asphalt);
        /// <summary>Concrete slabs with joints every metre (sidewalks, bare floors, bunker walls).</summary>
        public static Texture2D Concrete => Get(Kind.Concrete);
        public static Texture2D Dirt => Get(Kind.Dirt);
        public static Texture2D Grass => Get(Kind.Grass);
        public static Texture2D Gravel => Get(Kind.Gravel);
        public static Texture2D Plaster => Get(Kind.Plaster);
        public static Texture2D Brick => Get(Kind.Brick);
        /// <summary>Wooden planks running along u.</summary>
        public static Texture2D Wood => Get(Kind.Wood);
        /// <summary>Floor tiles of 50 cm.</summary>
        public static Texture2D Tiles => Get(Kind.Tiles);
        /// <summary>Brushed metal (streaks along u) with a few scratches.</summary>
        public static Texture2D Metal => Get(Kind.Metal);
        public static Texture2D Fabric => Get(Kind.Fabric);

        public static Texture2D Get(Kind kind)
        {
            var tex = Cache[(int)kind];
            if (tex != null) return tex;
            var grey = Generate(kind);
            var px = new Color32[grey.Length];
            for (int i = 0; i < grey.Length; i++) { byte g = grey[i]; px[i] = new Color32(g, g, g, 255); }
            // sRGB like any albedo map: the grey value then scales the displayed colour directly
            tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true)
            {
                name = "DZTex_" + kind,
                filterMode = FilterMode.Trilinear,
                anisoLevel = 4,
                wrapMode = TextureWrapMode.Repeat,
            };
            tex.SetPixels32(px);
            tex.Apply(true, true); // build the mipmaps; the CPU copy is not needed afterwards
            Cache[(int)kind] = tex;
            return tex;
        }

        // ------------------------------------------------------------------ generation (plain C#, no Unity calls)
        /// <summary>Grey values of a texture, Size x Size, row 0 = v 0. Seamless; average Mean, range Low..1.</summary>
        public static byte[] Generate(Kind kind)
        {
            var f = new float[Size * Size];
            for (int i = 0; i < f.Length; i++) f[i] = Mean;
            switch (kind)
            {
                case Kind.Asphalt: GenAsphalt(f); break;
                case Kind.Concrete: GenConcrete(f); break;
                case Kind.Dirt: GenDirt(f); break;
                case Kind.Grass: GenGrass(f); break;
                case Kind.Gravel: GenGravel(f); break;
                case Kind.Plaster: GenPlaster(f); break;
                case Kind.Brick: GenBrick(f); break;
                case Kind.Wood: GenWood(f); break;
                case Kind.Tiles: GenTiles(f); break;
                case Kind.Metal: GenMetal(f); break;
                case Kind.Fabric: GenFabric(f); break;
            }
            return Finish(f);
        }

        private static void GenAsphalt(float[] f)
        {
            Noise(f, Size, Size, 0.07f, 1); // grain
            Noise(f, 128, 128, 0.04f, 2);
            Noise(f, 32, 32, 0.035f, 3);
            Noise(f, 8, 8, 0.025f, 4);
            Noise(f, 4, 4, 0.015f, 5);
            var rng = new Rng(11);
            for (int i = 0; i < 1500; i++) Dot(f, rng.Range(0, Size), rng.Range(0, Size), rng.Range(0.5f, 1.5f), rng.Range(-0.1f, 0.08f)); // stones
            // patches: soft darker blobs (old repairs, oil)
            var p = new float[f.Length];
            Noise(p, 4, 4, 1f, 6);
            Noise(p, 16, 16, 0.35f, 7);
            for (int i = 0; i < f.Length; i++) if (p[i] > 0.45f) f[i] -= Math.Min(0.06f, (p[i] - 0.45f) * 0.3f);
            for (int i = 0; i < 3; i++) Crack(f, ref rng, rng.Range(0, Size), rng.Range(0, Size), rng.Range(0, 6.28f), rng.Range(90f, 180f), 0.18f, 1);
        }

        private static void GenConcrete(float[] f)
        {
            Noise(f, Size, Size, 0.04f, 21);
            Noise(f, 64, 64, 0.03f, 22);
            Noise(f, 16, 16, 0.03f, 23);
            Noise(f, 4, 4, 0.02f, 24);
            var rng = new Rng(25);
            for (int i = 0; i < 260; i++) Dot(f, rng.Range(0, Size), rng.Range(0, Size), rng.Range(0.4f, 1.1f), rng.Range(-0.1f, -0.03f)); // pores
            float[] slab = { 0.012f, -0.01f, -0.016f, 0.008f };
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                    f[y * Size + x] += slab[(x >> 7) + 2 * (y >> 7)] - Math.Max(Joint(x & 127, 128, 0.2f), Joint(y & 127, 128, 0.2f));
            Crack(f, ref rng, 40, 90, 0.4f, 60f, 0.12f, 0);
        }

        private static void GenDirt(float[] f)
        {
            Noise(f, 4, 4, 0.04f, 31);
            Noise(f, 8, 8, 0.04f, 32);
            Noise(f, 16, 16, 0.035f, 33);
            Noise(f, 64, 64, 0.03f, 34);
            Noise(f, Size, Size, 0.06f, 35);
            var rng = new Rng(36);
            for (int i = 0; i < 600; i++)
            {
                bool light = rng.Float() < 0.6f;
                Dot(f, rng.Range(0, Size), rng.Range(0, Size), rng.Range(0.6f, 2f), light ? rng.Range(0.03f, 0.09f) : rng.Range(-0.1f, -0.04f));
            }
        }

        private static void GenGrass(float[] f)
        {
            Noise(f, 4, 4, 0.04f, 41);
            Noise(f, 16, 16, 0.03f, 42);
            Noise(f, 128, 16, 0.05f, 43); // streaks along v
            Noise(f, Size, Size, 0.04f, 44);
            var rng = new Rng(45);
            for (int i = 0; i < 2600; i++) // blades, mostly upright
                Line(f, rng.Range(0, Size), rng.Range(0, Size), 1.5708f + rng.Range(-0.6f, 0.6f), rng.Range(3f, 9f), rng.Range(-0.12f, 0.1f));
        }

        private static void GenGravel(float[] f)
        {
            Noise(f, 8, 8, 0.03f, 51);
            Noise(f, Size, Size, 0.05f, 52);
            var rng = new Rng(53);
            for (int i = 0; i < 3000; i++)
            {
                float x = rng.Range(0, Size), y = rng.Range(0, Size), r = rng.Range(0.7f, 2.4f);
                Dot(f, x, y, r, rng.Range(-0.15f, 0.09f));
                if (r > 1.3f) Dot(f, x - r * 0.3f, y + r * 0.3f, r * 0.45f, 0.035f); // highlight on the lit side
            }
        }

        private static void GenPlaster(float[] f)
        {
            Noise(f, Size, Size, 0.025f, 61);
            Noise(f, 128, 128, 0.02f, 62);
            Noise(f, 32, 32, 0.02f, 63);
            Noise(f, 8, 8, 0.025f, 64);
            Noise(f, 4, 4, 0.015f, 65);
            // faint vertical streaks (water marks): narrow along u, long along v, only darkening
            var s = new float[f.Length];
            Noise(s, 64, 2, 1f, 66);
            Noise(s, 128, 4, 0.5f, 67);
            for (int i = 0; i < f.Length; i++) f[i] -= Math.Max(0f, s[i] - 0.3f) * 0.07f;
        }

        private static void GenBrick(float[] f)
        {
            // 32 courses of 6.25 cm and bricks of 25 cm (half offset every other course) with 1 px mortar
            const int course = 8, brick = 32;
            for (int y = 0; y < Size; y++)
            {
                int row = y / course, ly = y % course, off = (row & 1) * brick / 2;
                for (int x = 0; x < Size; x++)
                {
                    int lx = (x + off) % brick, bx = (x + off) / brick % (Size / brick);
                    float v;
                    if (ly == 0 || lx == 0) v = 0.97f; // mortar
                    else
                    {
                        v = 0.83f + (Rand01((uint)bx, (uint)row, 71) - 0.5f) * 0.12f;
                        if (ly == course - 1) v += 0.025f; // upper edge catches the light
                        else if (ly == 1) v -= 0.035f;     // lower edge in the joint's shadow
                        if (lx == 1) v -= 0.02f;
                    }
                    f[y * Size + x] = v;
                }
            }
            Noise(f, Size, Size, 0.035f, 72);
            Noise(f, 64, 64, 0.025f, 73);
            Noise(f, 8, 8, 0.03f, 74);
            Noise(f, 4, 4, 0.02f, 75);
        }

        private static void GenWood(float[] f)
        {
            // planks of 12.5 cm along u, 1 m long, every row with its own offset, shade and grain
            const int plank = 16, len = 128;
            var g = new float[f.Length];
            Noise(g, 4, 64, 1f, 81);
            Noise(g, 16, 128, 0.5f, 82);
            for (int y = 0; y < Size; y++)
            {
                int row = y / plank, ly = y % plank;
                int off = (int)(Rand01((uint)row, 0, 83) * Size);
                for (int x = 0; x < Size; x++)
                {
                    int lx = (x + off) & Mask, seg = lx / len;
                    float grain = g[y * Size + ((x + off * 7) & Mask)];
                    float v = Mean + (Rand01((uint)seg, (uint)row, 84) - 0.5f) * 0.1f + grain * 0.05f
                              + (float)Math.Sin((ly + grain * 6f) * 1.2f) * 0.02f; // growth rings
                    f[y * Size + x] = v - Math.Max(Joint(ly, plank, 0.22f), Joint(lx % len, len, 0.18f));
                }
            }
            Noise(f, Size, Size, 0.02f, 85);
            var rng = new Rng(86);
            for (int i = 0; i < 7; i++) // knots
            {
                float rx = rng.Range(3.5f, 6f);
                Blob(f, rng.Range(0, Size), rng.Range(0, Size), rx, rx * 0.45f, -0.16f);
            }
        }

        private static void GenTiles(float[] f)
        {
            const int tile = 64;
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    int lx = x % tile, ly = y % tile;
                    float v = 0.92f + (Rand01((uint)(x / tile), (uint)(y / tile), 91) - 0.5f) * 0.06f;
                    if (lx == 2 || ly == tile - 3) v += 0.02f;      // bevel: lit edges
                    else if (lx == tile - 3 || ly == 2) v -= 0.03f; // shaded edges
                    f[y * Size + x] = v - Math.Max(Joint(lx, tile, 0.24f), Joint(ly, tile, 0.24f));
                }
            Noise(f, Size, Size, 0.02f, 92);
            Noise(f, 16, 16, 0.015f, 93);
            Noise(f, 4, 4, 0.02f, 94);
        }

        private static void GenMetal(float[] f)
        {
            Noise(f, 2, Size, 0.035f, 101); // brushed: every row varies slowly along u
            Noise(f, 8, 128, 0.02f, 102);
            Noise(f, Size, Size, 0.015f, 103);
            Noise(f, 8, 8, 0.03f, 104);
            Noise(f, 4, 4, 0.02f, 105);
            var rng = new Rng(106);
            for (int i = 0; i < 70; i++) // scratches
                Line(f, rng.Range(0, Size), rng.Range(0, Size), rng.Range(0, 6.28f), rng.Range(6f, 34f), rng.Float() < 0.6f ? 0.06f : -0.05f);
            for (int i = 0; i < 10; i++) // stains
            {
                float r = rng.Range(6f, 16f);
                Blob(f, rng.Range(0, Size), rng.Range(0, Size), r, r * rng.Range(0.6f, 1f), -0.05f);
            }
        }

        private static void GenFabric(float[] f)
        {
            // plain weave of 4 px threads: in each cell either the horizontal or the vertical thread lies on top
            const int thread = 4;
            float[] profile = { -0.06f, 0.02f, 0.03f, -0.03f };
            var rows = new float[Size / thread];
            var cols = new float[Size / thread];
            for (int i = 0; i < rows.Length; i++)
            {
                rows[i] = (Rand01((uint)i, 0, 111) - 0.5f) * 0.06f;
                cols[i] = (Rand01((uint)i, 1, 111) - 0.5f) * 0.06f;
            }
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    int cx = x / thread, cy = y / thread;
                    bool weft = ((cx + cy) & 1) == 0;
                    f[y * Size + x] += weft ? profile[y % thread] + rows[cy] : profile[x % thread] + cols[cx];
                }
            Noise(f, Size, Size, 0.03f, 112);
            Noise(f, 8, 8, 0.03f, 113);
            Noise(f, 32, 32, 0.02f, 114);
        }

        // ------------------------------------------------------------------ helpers
        /// <summary>Shifts the values to the common mean, clamps them to Low..1 and converts them to bytes.</summary>
        private static byte[] Finish(float[] f)
        {
            for (int pass = 0; pass < 3; pass++) // clamping moves the mean a little: repeat
            {
                double sum = 0;
                for (int i = 0; i < f.Length; i++) sum += f[i];
                float shift = Mean - (float)(sum / f.Length);
                for (int i = 0; i < f.Length; i++) f[i] = Math.Min(1f, Math.Max(Low, f[i] + shift));
            }
            var g = new byte[f.Length];
            for (int i = 0; i < f.Length; i++) g[i] = (byte)(f[i] * 255f + 0.5f);
            return g;
        }

        /// <summary>
        /// Adds periodic value noise in about [-amp, amp] with cellsX x cellsY lattice cells across the texture (powers of two
        /// up to Size; Size cells = one value per pixel). The lattice wraps, so the result tiles seamlessly.
        /// </summary>
        private static void Noise(float[] f, int cellsX, int cellsY, float amp, uint seed)
        {
            int cw = Size / cellsX, chh = Size / cellsY;
            var lat = new float[cellsX * cellsY];
            for (int j = 0; j < cellsY; j++)
                for (int i = 0; i < cellsX; i++)
                    lat[j * cellsX + i] = (Rand01((uint)i, (uint)j, seed) * 2f - 1f) * amp;
            var wx = new float[Size];
            var x0 = new int[Size];
            var x1 = new int[Size];
            for (int x = 0; x < Size; x++)
            {
                int c = x / cw;
                float t = (x - c * cw) / (float)cw;
                x0[x] = c;
                x1[x] = (c + 1) % cellsX;
                wx[x] = t * t * (3f - 2f * t);
            }
            for (int y = 0; y < Size; y++)
            {
                int cy = y / chh, r0 = cy * cellsX, r1 = (cy + 1) % cellsY * cellsX;
                float t = (y - cy * chh) / (float)chh, wy = t * t * (3f - 2f * t);
                int row = y * Size;
                for (int x = 0; x < Size; x++)
                {
                    float a = lat[r0 + x0[x]], b = lat[r0 + x1[x]], c = lat[r1 + x0[x]], d = lat[r1 + x1[x]];
                    float top = a + (b - a) * wx[x], bottom = c + (d - c) * wx[x];
                    f[row + x] += top + (bottom - top) * wy;
                }
            }
        }

        /// <summary>Darkening of a 2 px joint centred on the edge of a cell (local 0 = first pixel after the edge).</summary>
        private static float Joint(int local, int cell, float depth)
        {
            if (local == 0 || local == cell - 1) return depth;
            if (local == 1 || local == cell - 2) return depth * 0.3f;
            return 0f;
        }

        private static void Add(float[] f, int x, int y, float v) => f[(y & Mask) * Size + (x & Mask)] += v;

        private static void Dot(float[] f, float cx, float cy, float r, float v) => Dot(f, cx, cy, r, r, v);

        /// <summary>Soft-edged ellipse (wraps around the edges).</summary>
        private static void Dot(float[] f, float cx, float cy, float rx, float ry, float v)
        {
            int xa = (int)Math.Floor(cx - rx - 1), xb = (int)Math.Ceiling(cx + rx + 1);
            int ya = (int)Math.Floor(cy - ry - 1), yb = (int)Math.Ceiling(cy + ry + 1);
            float r = Math.Min(rx, ry);
            for (int y = ya; y <= yb; y++)
                for (int x = xa; x <= xb; x++)
                {
                    float dx = (x + 0.5f - cx) / rx, dy = (y + 0.5f - cy) / ry;
                    float w = (1f - (float)Math.Sqrt(dx * dx + dy * dy)) * r + 0.5f; // about one pixel of soft edge
                    if (w > 0f) Add(f, x, y, v * Math.Min(1f, w));
                }
        }

        /// <summary>Soft blob with a smooth falloff to its radius (stains, knots); wraps around the edges.</summary>
        private static void Blob(float[] f, float cx, float cy, float rx, float ry, float v)
        {
            int xa = (int)Math.Floor(cx - rx), xb = (int)Math.Ceiling(cx + rx);
            int ya = (int)Math.Floor(cy - ry), yb = (int)Math.Ceiling(cy + ry);
            for (int y = ya; y <= yb; y++)
                for (int x = xa; x <= xb; x++)
                {
                    float dx = (x + 0.5f - cx) / rx, dy = (y + 0.5f - cy) / ry, d2 = dx * dx + dy * dy;
                    if (d2 < 1f) Add(f, x, y, v * (1f - d2) * (1f - d2));
                }
        }

        /// <summary>Straight 1 px stroke that fades towards its end (blades, scratches).</summary>
        private static void Line(float[] f, float x, float y, float angle, float length, float v)
        {
            float dx = (float)Math.Cos(angle), dy = (float)Math.Sin(angle);
            for (int s = 0; s <= (int)length; s++)
                Add(f, (int)Math.Floor(x + dx * s), (int)Math.Floor(y + dy * s), v * (1f - 0.6f * s / length));
        }

        /// <summary>Thin dark wandering line, thinning out towards its end; forks up to the given number of times.</summary>
        private static void Crack(float[] f, ref Rng rng, float x, float y, float angle, float length, float depth, int forks)
        {
            int forkAt = forks > 0 ? (int)(length * rng.Range(0.3f, 0.7f)) : -1;
            float heading = angle;
            for (int s = 0; s < (int)length; s++)
            {
                // jagged, but pulled back towards the main heading so it never curls into loops
                angle += rng.Range(-0.45f, 0.45f) + (heading - angle) * 0.25f;
                x += (float)Math.Cos(angle);
                y += (float)Math.Sin(angle);
                float d = depth * (1f - 0.6f * s / length);
                int ix = (int)Math.Floor(x), iy = (int)Math.Floor(y);
                Add(f, ix, iy, -d);
                Add(f, ix + 1, iy, -d * 0.25f);
                Add(f, ix - 1, iy, -d * 0.25f);
                Add(f, ix, iy + 1, -d * 0.25f);
                Add(f, ix, iy - 1, -d * 0.25f);
                if (s == forkAt) Crack(f, ref rng, x, y, heading + (rng.Float() < 0.5f ? -0.8f : 0.8f), (length - s) * 0.6f, d * 0.8f, forks - 1);
            }
        }

        private static uint Hash(uint x, uint y, uint seed)
        {
            uint h = seed * 0x9E3779B9u ^ x * 0x85EBCA6Bu ^ y * 0xC2B2AE35u;
            h ^= h >> 15; h *= 0x2C1B3C6Du;
            h ^= h >> 12; h *= 0x297A2D39u;
            h ^= h >> 15;
            return h;
        }

        private static float Rand01(uint x, uint y, uint seed) => (Hash(x, y, seed) >> 8) / 16777216f;

        /// <summary>Small deterministic random generator (xorshift), so every texture looks the same on every start.</summary>
        private struct Rng
        {
            private uint _s;
            public Rng(uint seed) { _s = Hash(seed, 0x51ED, 0x2F0B) | 1u; }
            public float Float()
            {
                _s ^= _s << 13; _s ^= _s >> 17; _s ^= _s << 5;
                return (_s >> 8) / 16777216f;
            }
            public float Range(float a, float b) => a + (b - a) * Float();
        }
    }
}
