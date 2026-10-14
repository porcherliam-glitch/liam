using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>A brook as polyline from upstream to downstream; the bed is carved into the terrain.</summary>
    public sealed class LayoutRiver
    {
        /// <summary>Id, e.g. <c>bach.muehlbach</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Width of the water in metres.</summary>
        public double Width { get; internal set; }

        /// <summary>Width of each bank slope in metres.</summary>
        public double Bank { get; internal set; }

        /// <summary>Depth of the bed below the surrounding ground.</summary>
        public double Depth { get; internal set; }

        /// <summary>Depth of the water above the bed.</summary>
        public double WaterDepth { get; internal set; }

        /// <summary>Points from upstream to downstream.</summary>
        public IReadOnlyList<LayoutPoint> Points { get; internal set; } = Array.Empty<LayoutPoint>();
    }
}
