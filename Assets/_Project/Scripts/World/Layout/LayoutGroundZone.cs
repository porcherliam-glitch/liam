namespace Aetherfall.World
{
    /// <summary>Circle that paints one ground kind with a soft edge.</summary>
    public sealed class LayoutGroundZone
    {
        /// <summary>Id, e.g. <c>boden.asche_dorf</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Ground kind.</summary>
        public GroundKind Ground { get; internal set; }

        /// <summary>Centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Radius with full strength.</summary>
        public double Radius { get; internal set; }

        /// <summary>Width of the soft edge.</summary>
        public double Falloff { get; internal set; }

        /// <summary>Strength 0..1.</summary>
        public double Strength { get; internal set; }
    }
}
