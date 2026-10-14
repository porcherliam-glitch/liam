namespace Aetherfall.World
{
    /// <summary>Named circle (e.g. a clearing).</summary>
    public sealed class LayoutCircle
    {
        /// <summary>Id.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Radius in metres.</summary>
        public double Radius { get; internal set; }
    }
}
