using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Scatter group: jittered grid inside a polygon, deterministic per seed (<see cref="VegetationScatter"/>).</summary>
    public sealed class VegetationGroup
    {
        /// <summary>Id, e.g. <c>wald.nordost</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Seed of the random generator.</summary>
        public ulong Seed { get; internal set; }

        /// <summary>Grid cell size in metres.</summary>
        public double Spacing { get; internal set; }

        /// <summary>Share of cells that get a plant (0..1).</summary>
        public double Density { get; internal set; }

        /// <summary>Random offset as a share of the cell size (0..1).</summary>
        public double Jitter { get; internal set; }

        /// <summary>Smallest scale.</summary>
        public double ScaleMin { get; internal set; }

        /// <summary>Largest scale.</summary>
        public double ScaleMax { get; internal set; }

        /// <summary>Species with weights.</summary>
        public IReadOnlyList<VegetationSpeciesWeight> Species { get; internal set; } = Array.Empty<VegetationSpeciesWeight>();

        /// <summary>Area (at least 3 points).</summary>
        public IReadOnlyList<LayoutPoint> Polygon { get; internal set; } = Array.Empty<LayoutPoint>();
    }
}
