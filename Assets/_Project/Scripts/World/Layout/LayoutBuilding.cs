namespace Aetherfall.World
{
    /// <summary>Building of the layout (blockout from primitives with a generated roof).</summary>
    public sealed class LayoutBuilding
    {
        /// <summary>Object id (<c>obj.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name (German).</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Type.</summary>
        public BuildingKind Kind { get; internal set; }

        /// <summary>Condition (intact, burned, collapsed).</summary>
        public BuildingState State { get; internal set; }

        /// <summary>Centre of the footprint on the ground.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Rotation in degrees; the front (door, gable end) points this way.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Width across the front in metres.</summary>
        public double Width { get; internal set; }

        /// <summary>Height of the walls up to the eaves.</summary>
        public double WallHeight { get; internal set; }

        /// <summary>Depth along the facing direction (ridge direction).</summary>
        public double Depth { get; internal set; }

        /// <summary>Roof shape.</summary>
        public RoofKind Roof { get; internal set; }

        /// <summary>Roof pitch in degrees.</summary>
        public double RoofPitch { get; internal set; }

        /// <summary>True if embers still glow (emissive material and light).</summary>
        public bool Glow { get; internal set; }
    }
}
