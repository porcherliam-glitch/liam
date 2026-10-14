namespace Aetherfall.World
{
    /// <summary>The Aether rift: crater in the terrain, glowing tear and crystal shards (GDD 05 3.4).</summary>
    public sealed class LayoutRift
    {
        /// <summary>Object id (<c>obj.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Centre of the crater.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Radius of the crater bowl.</summary>
        public double Radius { get; internal set; }

        /// <summary>Depth of the bowl.</summary>
        public double Depth { get; internal set; }

        /// <summary>Height of the rim.</summary>
        public double Rim { get; internal set; }

        /// <summary>Half width of the rim ring.</summary>
        public double RimWidth { get; internal set; }

        /// <summary>Height of the glowing tear.</summary>
        public double TearHeight { get; internal set; }

        /// <summary>Width of the tear.</summary>
        public double TearWidth { get; internal set; }

        /// <summary>Rotation of the tear in degrees.</summary>
        public double TearYaw { get; internal set; }

        /// <summary>Number of crystal shards.</summary>
        public int Crystals { get; internal set; }

        /// <summary>Seed of the shard placement.</summary>
        public ulong CrystalSeed { get; internal set; }

        /// <summary>Aether density 0..3 (GDD 01 1.2).</summary>
        public int AetherDensity { get; internal set; }

        /// <summary>Range of the turquoise light in metres.</summary>
        public double LightRange { get; internal set; }
    }
}
