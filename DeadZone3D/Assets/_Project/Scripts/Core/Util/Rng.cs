using System;
using System.Collections.Generic;

namespace DeadZone.Core
{
    /// <summary>Deterministic sfc32 random generator, bit-identical to the RNG of the HTML version.</summary>
    public sealed class Rng
    {
        private uint _a, _b, _c, _d;
        public uint Seed { get; }

        public Rng(uint seed)
        {
            Seed = seed;
            _a = seed ^ 0x9e3779b9u;
            // The HTML version multiplies in double precision before ToUint32; reproduce that rounding exactly.
            _b = JsMulU32(seed, 0x85ebca6bu);
            _c = JsMulU32(seed, 0xc2b2ae35u);
            _d = seed | 1u;
            for (int i = 0; i < 12; i++) Next();
        }

        private static uint JsMulU32(uint a, uint b)
        {
            double d = (double)a * b;
            double m = d - Math.Floor(d / 4294967296.0) * 4294967296.0;
            return (uint)m;
        }

        public Rng(string seed) : this(Hash.String(seed ?? "seed")) { }

        /// <summary>Uniform double in [0, 1).</summary>
        public double Next()
        {
            unchecked
            {
                uint a = _a, b = _b, c = _c, d = _d;
                uint t = a + b + d;
                d = d + 1;
                a = b ^ (b >> 9);
                b = c + (c << 3);
                c = (c << 21) | (c >> 11);
                c = c + t;
                _a = a; _b = b; _c = c; _d = d;
                return t / 4294967296.0;
            }
        }

        /// <summary>Internal state (debugging and parity tests only).</summary>
        public string State => _a + "," + _b + "," + _c + "," + _d;

        public double Float(double min, double max) => min + (max - min) * Next();
        public int Int(int min, int max) => (int)Math.Floor(Next() * (max - min + 1)) + min;
        public bool Chance(double p) => Next() < p;

        public T Pick<T>(IReadOnlyList<T> list)
        {
            if (list == null || list.Count == 0) return default;
            return list[(int)Math.Floor(Next() * list.Count)];
        }

        /// <summary>Weighted pick; entries with weight &lt;= 0 are skipped.</summary>
        public T Weighted<T>(IReadOnlyList<T> list, Func<T, double> weight)
        {
            if (list == null || list.Count == 0) return default;
            double total = 0;
            for (int i = 0; i < list.Count; i++) { double w = weight(list[i]); if (w > 0) total += w; }
            if (total <= 0) return default;
            double r = Next() * total;
            for (int i = 0; i < list.Count; i++)
            {
                double w = weight(list[i]);
                if (w <= 0) continue;
                r -= w;
                if (r < 0) return list[i];
            }
            for (int i = list.Count - 1; i >= 0; i--) if (weight(list[i]) > 0) return list[i];
            return default;
        }

        public List<T> Shuffle<T>(List<T> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(Next() * (i + 1));
                T t = list[i]; list[i] = list[j]; list[j] = t;
            }
            return list;
        }

        public Rng Fork(string label)
        {
            uint v = (uint)Math.Floor(Next() * 4294967296.0);
            return new Rng(v ^ Hash.String(label ?? "fork"));
        }
    }

    /// <summary>FNV-1a 32-bit string hash (same values as hashString in the HTML version).</summary>
    public static class Hash
    {
        public static uint String(string s)
        {
            unchecked
            {
                uint h = 0x811c9dc5u;
                foreach (char ch in s ?? "")
                {
                    h ^= ch;
                    h *= 0x01000193u;
                }
                return h;
            }
        }
    }
}
