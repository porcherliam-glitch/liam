namespace Aetherfall.World
{
    /// <summary>Small object of the layout.</summary>
    public sealed class LayoutProp
    {
        /// <summary>Object id (<c>obj.</c>).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Type.</summary>
        public PropKind Kind { get; internal set; }

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Rotation in degrees (front = this direction).</summary>
        public double Yaw { get; internal set; }
    }
}
