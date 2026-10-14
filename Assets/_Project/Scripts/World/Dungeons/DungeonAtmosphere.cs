namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Mood of the dungeon (GDD 05 3.3/3.4: dark stone, warm fire, Aether turquoise reserved for the rift): ambient light, fog
    /// and the colours of stone, floor, ceiling, torches, Aether and daylight as #RRGGBB.
    /// </summary>
    public sealed class DungeonAtmosphere
    {
        /// <summary>Ambient light colour (dark).</summary>
        public string AmbientColor { get; set; } = "#141720";

        /// <summary>Fog colour.</summary>
        public string FogColor { get; set; } = "#07080C";

        /// <summary>Exponential fog density.</summary>
        public float FogDensity { get; set; } = 0.04f;

        /// <summary>Wall colour.</summary>
        public string StoneColor { get; set; } = "#5C5852";

        /// <summary>Floor colour.</summary>
        public string FloorColor { get; set; } = "#46423C";

        /// <summary>Ceiling colour.</summary>
        public string CeilingColor { get; set; } = "#2E2B28";

        /// <summary>Torch and brazier colour.</summary>
        public string TorchColor { get; set; } = "#FF9A4A";

        /// <summary>Aether colour (GDD 05 3.4: #2FE6D6).</summary>
        public string AetherColor { get; set; } = "#2FE6D6";

        /// <summary>Daylight colour at the exits.</summary>
        public string DaylightColor { get; set; } = "#CFDDFF";
    }
}
