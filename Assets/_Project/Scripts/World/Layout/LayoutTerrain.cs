using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Terrain part of a <see cref="RegionLayout"/>.</summary>
    public sealed class LayoutTerrain
    {
        /// <summary>Edge length of the square terrain in metres (centred on the origin).</summary>
        public double Size { get; internal set; }

        /// <summary>Heightmap samples per edge (2^n + 1).</summary>
        public int HeightmapResolution { get; internal set; }

        /// <summary>Ground texture samples per edge (2^n).</summary>
        public int AlphamapResolution { get; internal set; }

        /// <summary>Height of the terrain volume in metres (all heights lie in 0 .. MaxHeight).</summary>
        public double MaxHeight { get; internal set; }

        /// <summary>Height of the valley floor before the features.</summary>
        public double BaseHeight { get; internal set; }

        /// <summary>Area the player may reach; the rest is scenery.</summary>
        public LayoutBounds PlayableBounds { get; internal set; }

        /// <summary>Hills that rise outside the playable bounds, or null.</summary>
        public LayoutBorder Border { get; internal set; }

        /// <summary>Gentle waves that break up flat ground.</summary>
        public IReadOnlyList<LayoutNoise> Noise { get; internal set; } = Array.Empty<LayoutNoise>();

        /// <summary>Slopes, hills and flattened areas in file order.</summary>
        public IReadOnlyList<TerrainFeature> Features { get; internal set; } = Array.Empty<TerrainFeature>();
    }
}
