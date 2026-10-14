namespace Aetherfall.World
{
    /// <summary>Purpose of a location zone (JSON <c>kind</c>).</summary>
    public enum LocationKind
    {
        /// <summary><c>settlement</c>: Village, farm or hamlet.</summary>
        Settlement = 0,

        /// <summary><c>poi</c>: Point of interest.</summary>
        Poi = 1,

        /// <summary><c>area</c>: Larger area (slope, forest).</summary>
        Area = 2,

        /// <summary><c>dungeon_entrance</c>: Entrance of a dungeon with its own scene.</summary>
        DungeonEntrance = 3,

        /// <summary><c>viewpoint</c>: Viewpoint (Aussichtspunkt, GDD 01 6.6).</summary>
        Viewpoint = 4
    }
}
