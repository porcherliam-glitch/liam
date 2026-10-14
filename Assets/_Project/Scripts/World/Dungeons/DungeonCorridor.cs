using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A corridor: axis-aligned polyline with an even width. Segments between points of different height are ramps or stairs;
    /// at inner points a flat square of the corridor width joins the segments (see <see cref="DungeonGeometry"/>).
    /// </summary>
    public sealed class DungeonCorridor
    {
        /// <summary>Id, e.g. <c>corridor.treppe_hallen</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Clear width in metres (even number, so the centre line lies on the grid).</summary>
        public float Width { get; set; } = 2f;

        /// <summary>Clear height from floor to ceiling in metres.</summary>
        public float Height { get; set; } = 3.5f;

        /// <summary>Polyline points (at least two).</summary>
        public List<DungeonCorridorPoint> Points { get; } = new List<DungeonCorridorPoint>();
    }
}
