using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Road or path as polyline; painted as earth.</summary>
    public sealed class LayoutPath
    {
        /// <summary>Id, e.g. <c>weg.reichsstrasse</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Width in metres.</summary>
        public double Width { get; internal set; }

        /// <summary>Points of the path.</summary>
        public IReadOnlyList<LayoutPoint> Points { get; internal set; } = Array.Empty<LayoutPoint>();
    }
}
