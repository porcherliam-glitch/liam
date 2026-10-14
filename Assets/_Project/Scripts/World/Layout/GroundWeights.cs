namespace Aetherfall.World
{
    /// <summary>Share of each ground layer at a point (sums to 1); order = <see cref="GroundKind"/>.</summary>
    public readonly struct GroundWeights
    {
        /// <summary>Creates the weights.</summary>
        /// <param name="grass">Grass.</param>
        /// <param name="dirt">Earth.</param>
        /// <param name="rock">Rock.</param>
        /// <param name="ash">Ash.</param>
        public GroundWeights(double grass, double dirt, double rock, double ash)
        {
            Grass = grass;
            Dirt = dirt;
            Rock = rock;
            Ash = ash;
        }

        /// <summary>Grass share.</summary>
        public double Grass { get; }

        /// <summary>Earth share.</summary>
        public double Dirt { get; }

        /// <summary>Rock share.</summary>
        public double Rock { get; }

        /// <summary>Ash share.</summary>
        public double Ash { get; }

        /// <summary>Weight of a layer by kind.</summary>
        /// <param name="kind">Layer.</param>
        public double Get(GroundKind kind)
        {
            switch (kind)
            {
                case GroundKind.Dirt:
                    return Dirt;
                case GroundKind.Rock:
                    return Rock;
                case GroundKind.Ash:
                    return Ash;
                default:
                    return Grass;
            }
        }
    }
}
