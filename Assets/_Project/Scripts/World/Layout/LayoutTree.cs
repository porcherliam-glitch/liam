namespace Aetherfall.World
{
    /// <summary>Explicit landmark tree.</summary>
    public sealed class LayoutTree
    {
        /// <summary>Id, e.g. <c>baum.dorflinde_lindenhain</c>.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Species.</summary>
        public VegetationKind Kind { get; internal set; }

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Scale.</summary>
        public double Scale { get; internal set; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; internal set; }
    }
}
