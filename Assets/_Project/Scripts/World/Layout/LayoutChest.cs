namespace Aetherfall.World
{
    /// <summary>Chest with loot.</summary>
    public sealed class LayoutChest
    {
        /// <summary>Object id (<c>obj.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Quality.</summary>
        public LayoutChestTier Tier { get; internal set; }

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Rotation in degrees (front = this direction).</summary>
        public double Yaw { get; internal set; }

        /// <summary>Area level (item level of the loot).</summary>
        public int AreaLevel { get; internal set; }

        /// <summary>Location id.</summary>
        public string LocationId { get; internal set; } = string.Empty;
    }
}
