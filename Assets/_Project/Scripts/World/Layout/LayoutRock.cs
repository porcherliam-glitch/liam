namespace Aetherfall.World
{
    /// <summary>Explicit rock of a landmark.</summary>
    public sealed class LayoutRock
    {
        /// <summary>Id, e.g. <c>fels.rabenfels_tor</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Base centre.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Width.</summary>
        public double SizeX { get; internal set; }

        /// <summary>Height.</summary>
        public double SizeY { get; internal set; }

        /// <summary>Depth.</summary>
        public double SizeZ { get; internal set; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Shape variant 0..2.</summary>
        public int Variant { get; internal set; }

        /// <summary>Metres above the ground (for rocks resting on other rocks).</summary>
        public double Lift { get; internal set; }
    }
}
