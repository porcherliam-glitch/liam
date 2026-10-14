namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Start point of the player in the dungeon scene (architecture 10.8: "Spieler am Eingangs-Anker"): spawn id, arrival
    /// anchor id (portals of other scenes name it), position and facing.
    /// </summary>
    public sealed class DungeonSpawn
    {
        /// <summary>Id, e.g. <c>spawn.gruft.eingang</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Arrival anchor id, e.g. <c>anchor.gruft.eingang</c>.</summary>
        public string AnchorId { get; set; } = string.Empty;

        /// <summary>X.</summary>
        public float X { get; set; }

        /// <summary>Z.</summary>
        public float Z { get; set; }

        /// <summary>Yaw in degrees.</summary>
        public float Yaw { get; set; }
    }
}
