using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Trail for a quest objective "Folge der Spur" (GDD 02 5.1 type 17, e.g. <c>spur.eichental.wolfsspur</c>): an ordered list
    /// of nodes. The generator puts a trigger on every node that sends <c>TrailNodeReached(trailId, index)</c>.
    /// </summary>
    public sealed class LayoutTrail
    {
        /// <summary>Trail id (<c>spur.</c>), the same id the quest objective uses.</summary>
        public string Id { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>Quest that follows the trail.</summary>
        public string QuestId { get; internal set; } = string.Empty;

        /// <summary>Radius of the node triggers in metres.</summary>
        public double Radius { get; internal set; }

        /// <summary>Nodes in walking order (index 0 = first node).</summary>
        public IReadOnlyList<LayoutPoint> Nodes { get; internal set; } = Array.Empty<LayoutPoint>();

        /// <summary>Note (source in the GDD).</summary>
        public string Note { get; internal set; } = string.Empty;
    }
}
