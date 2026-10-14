using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Vegetation part of a <see cref="RegionLayout"/>: scatter groups, landmark trees and clearings.</summary>
    public sealed class LayoutVegetation
    {
        /// <summary>Distances that scattered plants keep from other objects.</summary>
        public VegetationClearance Clearance { get; internal set; }

        /// <summary>Circles without scattered plants.</summary>
        public IReadOnlyList<LayoutCircle> Clearings { get; internal set; } = Array.Empty<LayoutCircle>();

        /// <summary>Scatter groups in file order.</summary>
        public IReadOnlyList<VegetationGroup> Groups { get; internal set; } = Array.Empty<VegetationGroup>();

        /// <summary>Explicit landmark trees.</summary>
        public IReadOnlyList<LayoutTree> Trees { get; internal set; } = Array.Empty<LayoutTree>();
    }
}
