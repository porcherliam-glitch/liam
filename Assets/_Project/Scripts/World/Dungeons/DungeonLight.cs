namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A point light of the layout. Kinds: <c>torch</c> (wall torch, warm), <c>brazier</c> (standing fire bowl, warm),
    /// <c>aether</c> (Aether glow, turquoise, GDD 05 3.4), <c>daylight</c> (cool light from outside at the exits).
    /// </summary>
    public sealed class DungeonLight
    {
        /// <summary>Kind: wall torch.</summary>
        public const string Torch = "torch";

        /// <summary>Kind: standing fire bowl.</summary>
        public const string Brazier = "brazier";

        /// <summary>Kind: Aether glow.</summary>
        public const string Aether = "aether";

        /// <summary>Kind: daylight from outside.</summary>
        public const string Daylight = "daylight";

        /// <summary>Kind (see the constants).</summary>
        public string Kind { get; set; } = Torch;

        /// <summary>X.</summary>
        public float X { get; set; }

        /// <summary>Z.</summary>
        public float Z { get; set; }

        /// <summary>Floor height; NaN = from the grid.</summary>
        public float Y { get; set; } = float.NaN;

        /// <summary>Height of the light above the floor (braziers: 1.3 m if not given).</summary>
        public float Height { get; set; } = float.NaN;

        /// <summary>Range in metres.</summary>
        public float Range { get; set; } = 8f;

        /// <summary>Intensity (Unity point light).</summary>
        public float Intensity { get; set; } = 1f;

        /// <summary>Colour as #RRGGBB; empty = colour of the kind from the atmosphere.</summary>
        public string Color { get; set; } = string.Empty;

        /// <summary>True for the known kinds.</summary>
        public bool IsKnownKind => Kind == Torch || Kind == Brazier || Kind == Aether || Kind == Daylight;

        /// <summary>Height above the floor with the default of the kind.</summary>
        public float EffectiveHeight => !float.IsNaN(Height) ? Height : Kind == Brazier ? 1.3f : 2.2f;
    }
}
