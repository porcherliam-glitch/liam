namespace Aetherfall.World
{
    /// <summary>A harvest node (S30, GDD 04 6.10): a plant that gives an item and grows back after some game days.</summary>
    public sealed class LayoutHarvestNode
    {
        /// <summary>Object id (<c>obj.</c>), key in the save game.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name ("Blutwurz").</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Kind (look).</summary>
        public HarvestNodeKind Kind { get; internal set; }

        /// <summary>Item it gives (<c>item.</c>).</summary>
        public string ItemId { get; internal set; } = string.Empty;

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Location id.</summary>
        public string LocationId { get; internal set; } = string.Empty;

        /// <summary>Game days until it grows back.</summary>
        public double RespawnDays { get; internal set; } = 1d;

        /// <summary>Smallest yield.</summary>
        public int MinYield { get; internal set; } = 1;

        /// <summary>Largest yield.</summary>
        public int MaxYield { get; internal set; } = 3;

        /// <summary>First hour it can be gathered (equal to <see cref="ActiveTo"/> = always).</summary>
        public double ActiveFrom { get; internal set; }

        /// <summary>End hour (exclusive, over midnight allowed).</summary>
        public double ActiveTo { get; internal set; }
    }
}
