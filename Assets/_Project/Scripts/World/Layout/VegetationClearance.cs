namespace Aetherfall.World
{
    /// <summary>Distances in metres that scattered vegetation keeps from other layout elements.</summary>
    public sealed class VegetationClearance
    {
        /// <summary>From path edges.</summary>
        public double Paths { get; internal set; }

        /// <summary>From the outer edge of the bank.</summary>
        public double Rivers { get; internal set; }

        /// <summary>From building walls.</summary>
        public double Buildings { get; internal set; }

        /// <summary>From field edges.</summary>
        public double Fields { get; internal set; }

        /// <summary>From the outer edge of the rift rim.</summary>
        public double Rift { get; internal set; }

        /// <summary>From fence lines.</summary>
        public double Fences { get; internal set; }
    }
}
