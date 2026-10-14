namespace Aetherfall.World
{
    /// <summary>Bridge over a brook.</summary>
    public sealed class LayoutBridge
    {
        /// <summary>Object id (<c>obj.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Material.</summary>
        public BridgeKind Kind { get; internal set; }

        /// <summary>Centre.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Direction of the crossing in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Length in metres.</summary>
        public double Length { get; internal set; }

        /// <summary>Width in metres.</summary>
        public double Width { get; internal set; }
    }
}
