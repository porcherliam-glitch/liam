namespace Aetherfall.World
{
    /// <summary>Species of a scatter group with its relative weight.</summary>
    public sealed class VegetationSpeciesWeight
    {
        /// <summary>Species.</summary>
        public VegetationKind Kind { get; internal set; }

        /// <summary>Relative weight (> 0).</summary>
        public double Weight { get; internal set; }
    }
}
