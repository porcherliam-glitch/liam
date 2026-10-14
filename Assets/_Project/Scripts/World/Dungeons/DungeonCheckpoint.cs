namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A checkpoint before a boss arena (GDD 03 4.12: "Vor jeder Boss-Arena liegt ein Checkpoint"; GDD 05 5.3: autosave "Vor
    /// einem Bosskampf (Vorkammer, nicht in der Arena)"): entering the zone moves the respawn point here and autosaves.
    /// </summary>
    public sealed class DungeonCheckpoint
    {
        /// <summary>Id, e.g. <c>checkpoint.gruft.vorkammer</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Zone rectangle.</summary>
        public DungeonRect Bounds { get; set; }

        /// <summary>True: an autosave is requested on entering.</summary>
        public bool Autosave { get; set; } = true;

        /// <summary>Respawn x.</summary>
        public float RespawnX { get; set; }

        /// <summary>Respawn z.</summary>
        public float RespawnZ { get; set; }

        /// <summary>Respawn yaw.</summary>
        public float RespawnYaw { get; set; }
    }
}
