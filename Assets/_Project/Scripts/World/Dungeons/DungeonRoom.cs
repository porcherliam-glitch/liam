namespace Aetherfall.World.Dungeons
{
    /// <summary>A room of a dungeon layout: flat floor, rectangle on the 1 m grid, ceiling height.</summary>
    public sealed class DungeonRoom
    {
        /// <summary>Id, e.g. <c>room.vorraum</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name (map label, scene object name).</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Floor rectangle.</summary>
        public DungeonRect Bounds { get; set; }

        /// <summary>Floor height in metres.</summary>
        public float FloorY { get; set; }

        /// <summary>Clear height from floor to ceiling in metres.</summary>
        public float Height { get; set; } = 4f;
    }
}
