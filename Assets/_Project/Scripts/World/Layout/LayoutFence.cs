using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Wooden fence as polyline.</summary>
    public sealed class LayoutFence
    {
        /// <summary>Id, e.g. <c>zaun.weide_hollmann</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Height in metres.</summary>
        public double Height { get; internal set; }

        /// <summary>True if the last point connects back to the first (enclosure).</summary>
        public bool Closed { get; internal set; }

        /// <summary>Points of the fence.</summary>
        public IReadOnlyList<LayoutPoint> Points { get; internal set; } = Array.Empty<LayoutPoint>();
    }
}
