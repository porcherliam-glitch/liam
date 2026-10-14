namespace Aetherfall.World
{
    /// <summary>Border hills outside the playable bounds of a <see cref="LayoutTerrain"/>.</summary>
    public sealed class LayoutBorder
    {
        /// <summary>Metres inside the playable bounds where the rise starts.</summary>
        public double Inset { get; internal set; }

        /// <summary>Metres over which the border reaches its full height.</summary>
        public double Width { get; internal set; }

        /// <summary>Full height of the border hills.</summary>
        public double Height { get; internal set; }
    }
}
