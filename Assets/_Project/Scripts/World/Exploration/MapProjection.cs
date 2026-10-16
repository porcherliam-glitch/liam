namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// Maps world metres (x, z) to the square map picture of a region and back (S63): <c>u</c> runs west to east, <c>v</c> south
    /// to north, both 0–1 over <see cref="Extent"/> metres from the south-west corner (<see cref="OriginX"/>, <see cref="OriginZ"/>).
    /// UI panels count from the top, so <see cref="ToPanel"/> flips <c>v</c>.
    /// </summary>
    public readonly struct MapProjection
    {
        /// <summary>Creates the projection.</summary>
        /// <param name="originX">West edge of the picture in world metres.</param>
        /// <param name="originZ">South edge of the picture in world metres.</param>
        /// <param name="extent">Width and height of the picture in metres (&gt; 0).</param>
        public MapProjection(float originX, float originZ, float extent)
        {
            OriginX = originX;
            OriginZ = originZ;
            Extent = extent > 0f ? extent : 1f;
        }

        /// <summary>West edge in world metres.</summary>
        public float OriginX { get; }

        /// <summary>South edge in world metres.</summary>
        public float OriginZ { get; }

        /// <summary>Side length in metres.</summary>
        public float Extent { get; }

        /// <summary>World position to picture coordinates (0–1, may lie outside for points off the picture).</summary>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        /// <param name="u">West–east coordinate.</param>
        /// <param name="v">South–north coordinate.</param>
        public void WorldToUv(float x, float z, out float u, out float v)
        {
            u = (x - OriginX) / Extent;
            v = (z - OriginZ) / Extent;
        }

        /// <summary>Picture coordinates to the world position.</summary>
        /// <param name="u">West–east coordinate.</param>
        /// <param name="v">South–north coordinate.</param>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        public void UvToWorld(float u, float v, out float x, out float z)
        {
            x = OriginX + u * Extent;
            z = OriginZ + v * Extent;
        }

        /// <summary>World position to panel fractions (left 0–1 from the west edge, top 0–1 from the north edge).</summary>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        /// <param name="left">Fraction from the left edge.</param>
        /// <param name="top">Fraction from the top edge.</param>
        public void ToPanel(float x, float z, out float left, out float top)
        {
            WorldToUv(x, z, out left, out float v);
            top = 1f - v;
        }
    }
}
