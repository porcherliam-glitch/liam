namespace Aetherfall.World
{
    /// <summary>Shape of a location zone (JSON <c>shape</c>).</summary>
    public enum LocationShape
    {
        /// <summary><c>circle</c>: Circle with <c>radius</c> (GoToObjective radius).</summary>
        Circle = 0,

        /// <summary><c>box</c>: Rotated rectangle with <c>size</c> and <c>yaw</c>.</summary>
        Box = 1
    }
}
