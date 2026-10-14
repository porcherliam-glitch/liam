using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A group of enemies (architecture 9.7 "Gegner aus Spawnern"): id like <c>spawn.eichental.gruft_hallen</c> (GDD 02 11.7
    /// "Gegner+(spawn.eichental.gruft_hallen)"), the room, when it wakes up and its enemies.
    /// </summary>
    public sealed class DungeonSpawner
    {
        /// <summary>Id.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Room the enemies stand in.</summary>
        public string Room { get; set; } = string.Empty;

        /// <summary>When the group appears (<c>always</c>, <c>puzzle</c>, <c>none</c> = only by quest action).</summary>
        public DungeonTrigger Activation { get; set; } = new DungeonTrigger { Type = DungeonTrigger.Always };

        /// <summary>Enemies.</summary>
        public List<DungeonEnemy> Enemies { get; } = new List<DungeonEnemy>();
    }
}
