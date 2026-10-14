namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// The four compass directions on the ground plane (Unity: north = +z, east = +x). Mirrors of the light puzzle have
    /// exactly these four positions (GDD 02 11.7: "3 drehbare Spiegel (je 4 Stellungen)"). Stored in save data as number:
    /// never renumber.
    /// </summary>
    public enum GridDirection
    {
        /// <summary>North (+z), yaw 0°.</summary>
        North = 0,

        /// <summary>East (+x), yaw 90°.</summary>
        East = 1,

        /// <summary>South (−z), yaw 180°.</summary>
        South = 2,

        /// <summary>West (−x), yaw 270°.</summary>
        West = 3
    }
}
