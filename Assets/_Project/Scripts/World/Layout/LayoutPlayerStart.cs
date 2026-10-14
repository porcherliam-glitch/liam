namespace Aetherfall.World
{
    /// <summary>Start of a new game.</summary>
    public sealed class LayoutPlayerStart
    {
        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Facing in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Note (German).</summary>
        public string Note { get; internal set; } = string.Empty;
    }
}
