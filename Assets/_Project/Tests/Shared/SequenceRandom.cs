using System;
using Aetherfall.Utilities;

namespace Aetherfall.Tests.Shared
{
    /// <summary>
    /// <see cref="IRandom"/> test double that returns preset values in [0, 1) in a loop (e.g. a critical roll of 0.049).
    /// Counts how many values were drawn.
    /// </summary>
    public sealed class SequenceRandom : IRandom
    {
        private readonly float[] _values;
        private int _next;

        /// <summary>Creates the double.</summary>
        /// <param name="values">Values returned by <see cref="NextFloat"/>, in order, repeated; each in [0, 1).</param>
        public SequenceRandom(params float[] values)
        {
            if (values == null || values.Length == 0)
            {
                throw new ArgumentException("At least one value is required.", nameof(values));
            }

            _values = values;
        }

        /// <summary>Number of values drawn so far.</summary>
        public int DrawCount { get; private set; }

        /// <inheritdoc />
        public float NextFloat()
        {
            float value = _values[_next];
            _next = (_next + 1) % _values.Length;
            DrawCount++;
            return value;
        }

        /// <inheritdoc />
        public double NextDouble()
        {
            return NextFloat();
        }

        /// <inheritdoc />
        public uint NextUInt()
        {
            return (uint)(NextFloat() * 4294967295.0);
        }

        /// <inheritdoc />
        public int Range(int minInclusive, int maxExclusive)
        {
            return minInclusive + (int)(NextFloat() * (maxExclusive - minInclusive));
        }

        /// <inheritdoc />
        public float Range(float min, float max)
        {
            return min + NextFloat() * (max - min);
        }
    }
}
