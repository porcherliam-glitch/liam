namespace Aetherfall.Utilities
{
    /// <summary>
    /// Source of random numbers for game logic (architecture 3.3: <c>IRandom</c> + <see cref="Pcg32Random"/> in Utilities).
    /// Pure domain classes such as the damage calculator or the loot roller receive it through their methods or
    /// constructors, so tests can pass a seeded generator or a fixed sequence and get reproducible results.
    /// </summary>
    /// <remarks>Never use <c>UnityEngine.Random</c> or <c>System.Random</c> in game logic: neither is seedable per system.</remarks>
    public interface IRandom
    {
        /// <summary>Next raw value, uniformly distributed over all 32-bit values.</summary>
        uint NextUInt();

        /// <summary>Next value in [0, 1) with 24 bits of precision.</summary>
        float NextFloat();

        /// <summary>Next value in [0, 1) with 53 bits of precision.</summary>
        double NextDouble();

        /// <summary>Next integer in [<paramref name="minInclusive"/>, <paramref name="maxExclusive"/>), without modulo bias.</summary>
        /// <param name="minInclusive">Smallest possible result.</param>
        /// <param name="maxExclusive">Upper bound (exclusive); must be greater than <paramref name="minInclusive"/>.</param>
        /// <exception cref="System.ArgumentOutOfRangeException"><paramref name="maxExclusive"/> is not greater than <paramref name="minInclusive"/>.</exception>
        int Range(int minInclusive, int maxExclusive);

        /// <summary>Next value in [<paramref name="min"/>, <paramref name="max"/>).</summary>
        /// <param name="min">Lower bound (inclusive).</param>
        /// <param name="max">Upper bound (exclusive).</param>
        float Range(float min, float max);
    }
}
