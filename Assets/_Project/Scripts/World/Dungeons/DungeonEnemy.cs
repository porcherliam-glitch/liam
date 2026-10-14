using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// One enemy of a spawner (or a summoned add of the boss): type and variant (GDD 01 11.2), position, facing, guard or
    /// patrol. Its unique id in events is <c>Type#Number</c> (EnemyController builds it that way).
    /// </summary>
    public sealed class DungeonEnemy
    {
        /// <summary>Variant: normal.</summary>
        public const string Normal = "normal";

        /// <summary>Variant: elite (level +2, health ×2).</summary>
        public const string Elite = "elite";

        /// <summary>Variant: champion (level +3, health ×4).</summary>
        public const string Champion = "champion";

        /// <summary>Instance number, part of the unique id (e.g. <c>gruft_hallen_1</c>).</summary>
        public string Number { get; set; } = string.Empty;

        /// <summary>Enemy type id, e.g. <c>enemy.untot.skelett_krieger</c>.</summary>
        public string Type { get; set; } = string.Empty;

        /// <summary>Variant (normal, elite, champion).</summary>
        public string Variant { get; set; } = Normal;

        /// <summary>X (east).</summary>
        public float X { get; set; }

        /// <summary>Z (north).</summary>
        public float Z { get; set; }

        /// <summary>Yaw in degrees.</summary>
        public float Yaw { get; set; }

        /// <summary>True: stands guard at its place; false: patrols.</summary>
        public bool Guard { get; set; } = true;

        /// <summary>Patrol route (empty = guard).</summary>
        public List<DungeonPoint> Patrol { get; } = new List<DungeonPoint>();

        /// <summary>Carries a tower shield and blocks frontal hits (elite skeleton, GDD 01 11.4).</summary>
        public bool TowerShield { get; set; }

        /// <summary>Unique id as in the event <c>EnemyKilled</c>.</summary>
        public string UniqueId => Type + "#" + Number;

        /// <summary>True for the known variants.</summary>
        public bool IsKnownVariant => Variant == Normal || Variant == Elite || Variant == Champion;
    }
}
