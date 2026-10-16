namespace Aetherfall.World.Exploration
{
    /// <summary>An own marker on a map (GDD 05 1.8, GDD 01 6.6): where the player put it and which symbol it has.</summary>
    public readonly struct MapMarker
    {
        /// <summary>Creates a marker.</summary>
        /// <param name="x">World x in metres.</param>
        /// <param name="z">World z in metres.</param>
        /// <param name="symbol">Symbol index (0 to <see cref="MapMarkerRules.SymbolCount"/> − 1).</param>
        public MapMarker(float x, float z, int symbol)
        {
            X = x;
            Z = z;
            Symbol = MapMarkerRules.ClampSymbol(symbol);
        }

        /// <summary>World x.</summary>
        public float X { get; }

        /// <summary>World z.</summary>
        public float Z { get; }

        /// <summary>Symbol index.</summary>
        public int Symbol { get; }
    }

    /// <summary>What setting or removing an own marker did.</summary>
    public enum MapMarkerChange
    {
        /// <summary>Nothing (no map).</summary>
        None = 0,

        /// <summary>A new marker was set.</summary>
        Added = 1,

        /// <summary>The marker at that point was removed.</summary>
        Removed = 2,

        /// <summary>The map already has the most markers allowed.</summary>
        Full = 3
    }

    /// <summary>Limits of the own markers (GDD 05 1.8: at most 50 on the map, at most 5 in the compass; 6 symbols).</summary>
    public static class MapMarkerRules
    {
        /// <summary>Most own markers per map.</summary>
        public const int MaxPerMap = 50;

        /// <summary>Number of symbols.</summary>
        public const int SymbolCount = 6;

        /// <summary>Most own markers in the compass (the nearest ones).</summary>
        public const int MaxOnCompass = 5;

        /// <summary>Wraps a symbol index into 0 to <see cref="SymbolCount"/> − 1.</summary>
        /// <param name="symbol">Any index.</param>
        public static int ClampSymbol(int symbol)
        {
            return (symbol % SymbolCount + SymbolCount) % SymbolCount;
        }
    }
}
