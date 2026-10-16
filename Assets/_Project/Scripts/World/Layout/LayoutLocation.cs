using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Location zone; becomes an AreaTrigger that sends <c>AreaEntered(id)</c>.</summary>
    public sealed class LayoutLocation
    {
        /// <summary>Location id (<c>loc.</c>, GDD 02 11.0).</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Purpose.</summary>
        public LocationKind Kind { get; internal set; }

        /// <summary>Shape.</summary>
        public LocationShape Shape { get; internal set; }

        /// <summary>Centre.</summary>
        public LayoutPoint Center { get; internal set; }

        /// <summary>Circle: radius.</summary>
        public double Radius { get; internal set; }

        /// <summary>Box: width.</summary>
        public double Width { get; internal set; }

        /// <summary>Box: depth.</summary>
        public double Depth { get; internal set; }

        /// <summary>Box: rotation in degrees.</summary>
        public double Yaw { get; internal set; }

        /// <summary>Quest ids that use the zone.</summary>
        public IReadOnlyList<string> Quests { get; internal set; } = Array.Empty<string>();

        /// <summary>Name on the world map; empty = no icon and no "Ort entdeckt" (sub-zones such as the village square).</summary>
        public string MapName { get; internal set; } = string.Empty;

        /// <summary>Viewpoints: fog cleared around them on activation in metres (GDD 01 6.6); 0 for other places.</summary>
        public double RevealRadius { get; internal set; }

        /// <summary>True if the location is a fast travel point (S50).</summary>
        public bool HasWaypoint { get; internal set; }

        /// <summary>Arrival point of the travel point (x, z).</summary>
        public LayoutPoint Waypoint { get; internal set; }

        /// <summary>Facing on arrival in degrees.</summary>
        public double WaypointYaw { get; internal set; }
    }
}
