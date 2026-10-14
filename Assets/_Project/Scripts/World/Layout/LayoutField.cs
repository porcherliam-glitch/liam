namespace Aetherfall.World
{
    /// <summary>Field as rotated rectangle with crop rows.</summary>
    public sealed class LayoutField
    {
        /// <summary>Id, e.g. <c>feld.weizen_ost</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Crop.</summary>
        public FieldCrop Crop { get; internal set; }

        /// <summary>Condition.</summary>
        public FieldState State { get; internal set; }

        /// <summary>Centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Size along the local x axis.</summary>
        public double Width { get; internal set; }

        /// <summary>Size along the local z axis.</summary>
        public double Depth { get; internal set; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Distance between crop rows.</summary>
        public double RowSpacing { get; internal set; }
    }
}
