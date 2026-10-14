namespace Aetherfall.World.Dungeons
{
    /// <summary>A point on the ground plane (patrol routes). Immutable value type.</summary>
    public readonly struct DungeonPoint
    {
        /// <summary>Creates the point.</summary>
        /// <param name="x">X (east).</param>
        /// <param name="z">Z (north).</param>
        public DungeonPoint(float x, float z)
        {
            X = x;
            Z = z;
        }

        /// <summary>X (east).</summary>
        public float X { get; }

        /// <summary>Z (north).</summary>
        public float Z { get; }
    }
}
