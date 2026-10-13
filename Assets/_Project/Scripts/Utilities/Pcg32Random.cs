using System;

namespace Aetherfall.Utilities
{
    /// <summary>
    /// Deterministic, seedable random number generator: PCG-XSH-RR 64/32 by M. E. O'Neill (pcg-random.org, reference
    /// implementation <c>pcg32_random_r</c>). Same seed and stream give the same sequence on every platform (Mono, IL2CPP,
    /// .NET), which makes combat rolls, loot and procedural content reproducible in tests and replays.
    /// </summary>
    /// <remarks>
    /// <para>Pure C#, allocation-free, not thread-safe (use one instance per system or thread).</para>
    /// <para>The state can be read and restored (<see cref="State"/>, <see cref="Increment"/>, <see cref="FromState"/>),
    /// e.g. to save a procedural seed together with its progress.</para>
    /// </remarks>
    public sealed class Pcg32Random : IRandom
    {
        private const ulong Multiplier = 6364136223846793005UL;
        private const double DoubleUnit = 1.0 / 9007199254740992.0; // 2^-53
        private const float FloatUnit = 1f / 16777216f;            // 2^-24

        private ulong _state;
        private ulong _increment;

        /// <summary>Creates a generator like <c>pcg32_srandom_r(seed, stream)</c>.</summary>
        /// <param name="seed">Start state; any value.</param>
        /// <param name="stream">Sequence selector; different streams give independent sequences for the same seed.</param>
        public Pcg32Random(ulong seed, ulong stream = 0xda3e39cb94b95bdbUL)
        {
            _state = 0UL;
            _increment = (stream << 1) | 1UL;
            NextUInt();
            _state += seed;
            NextUInt();
        }

        private Pcg32Random()
        {
        }

        /// <summary>Current internal state (for saving the generator).</summary>
        public ulong State => _state;

        /// <summary>Stream increment (always odd, for saving the generator).</summary>
        public ulong Increment => _increment;

        /// <summary>Restores a generator from <see cref="State"/> and <see cref="Increment"/>.</summary>
        /// <param name="state">Saved state.</param>
        /// <param name="increment">Saved increment; the lowest bit is forced to 1.</param>
        /// <returns>A generator that continues the saved sequence.</returns>
        public static Pcg32Random FromState(ulong state, ulong increment)
        {
            return new Pcg32Random { _state = state, _increment = increment | 1UL };
        }

        /// <inheritdoc />
        public uint NextUInt()
        {
            ulong old = _state;
            _state = unchecked(old * Multiplier + _increment);
            uint xorShifted = (uint)(((old >> 18) ^ old) >> 27);
            int rotation = (int)(old >> 59);
            return (xorShifted >> rotation) | (xorShifted << ((-rotation) & 31));
        }

        /// <inheritdoc />
        public float NextFloat()
        {
            return (NextUInt() >> 8) * FloatUnit;
        }

        /// <inheritdoc />
        public double NextDouble()
        {
            ulong high = NextUInt() >> 5; // 27 bits
            ulong low = NextUInt() >> 6;  // 26 bits
            return ((high << 26) | low) * DoubleUnit;
        }

        /// <inheritdoc />
        public int Range(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "maxExclusive must be greater than minInclusive.");
            }

            uint bound = (uint)((long)maxExclusive - minInclusive);

            // Rejection sampling of pcg32_boundedrand_r: values below the threshold would make the result biased.
            uint threshold = unchecked((uint)-bound) % bound;
            while (true)
            {
                uint value = NextUInt();
                if (value >= threshold)
                {
                    return (int)(minInclusive + (long)(value % bound));
                }
            }
        }

        /// <inheritdoc />
        public float Range(float min, float max)
        {
            return min + (max - min) * NextFloat();
        }
    }
}
