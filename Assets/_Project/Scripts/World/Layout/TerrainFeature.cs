namespace Aetherfall.World
{
    /// <summary>Height feature of the terrain (slope, hill or flatten area).</summary>
    public sealed class TerrainFeature
    {
        /// <summary>Id, e.g. <c>gelaende.nordhang</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name (German).</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Kind of the feature.</summary>
        public TerrainFeatureKind Kind { get; internal set; }

        /// <summary>Slope: point where the rise starts to be measured.</summary>
        public LayoutPoint Origin { get; internal set; }

        /// <summary>Slope: direction of the rise (normalised when used).</summary>
        public LayoutPoint Direction { get; internal set; }

        /// <summary>Slope: distance along the direction where the rise begins.</summary>
        public double Start { get; internal set; }

        /// <summary>Slope: distance along the direction where the full height is reached.</summary>
        public double End { get; internal set; }

        /// <summary>Slope and hill: height in metres (negative = hollow). Flatten: target height if <see cref="HasHeight"/>.</summary>
        public double Height { get; internal set; }

        /// <summary>Flatten: true if an explicit height is given; otherwise the height at the centre is used.</summary>
        public bool HasHeight { get; internal set; }

        /// <summary>Slope: true if the slope fades out sideways.</summary>
        public bool HasHalfWidth { get; internal set; }

        /// <summary>Slope: half width of the full-height band across the direction.</summary>
        public double HalfWidth { get; internal set; }

        /// <summary>Slope: metres over which it fades out sideways (0 = hard edge).</summary>
        public double Falloff { get; internal set; }

        /// <summary>Hill and flatten: centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Hill: radius.</summary>
        public double Radius { get; internal set; }

        /// <summary>Flatten: radius of the fully flat area.</summary>
        public double InnerRadius { get; internal set; }

        /// <summary>Flatten: radius where the blend ends.</summary>
        public double OuterRadius { get; internal set; }
    }
}
