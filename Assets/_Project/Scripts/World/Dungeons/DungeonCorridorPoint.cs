namespace Aetherfall.World.Dungeons
{
    /// <summary>One point of a corridor polyline: position on the ground plane and floor height there.</summary>
    public readonly struct DungeonCorridorPoint
    {
        /// <summary>Creates the point.</summary>
        /// <param name="x">X (east).</param>
        /// <param name="z">Z (north).</param>
        /// <param name="y">Floor height.</param>
        public DungeonCorridorPoint(float x, float z, float y)
        {
            X = x;
            Z = z;
            Y = y;
        }

        /// <summary>X (east).</summary>
        public float X { get; }

        /// <summary>Z (north).</summary>
        public float Z { get; }

        /// <summary>Floor height at this point.</summary>
        public float Y { get; }
    }
}
