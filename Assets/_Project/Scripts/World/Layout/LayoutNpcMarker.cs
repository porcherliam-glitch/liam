namespace Aetherfall.World
{
    /// <summary>Placeholder marker of an NPC; replaced by the real NPC later.</summary>
    public sealed class LayoutNpcMarker
    {
        /// <summary>NPC id (<c>npc.</c>, GDD 01 4.1.3 / GDD 02 11.0).</summary>
        public string NpcId { get; internal set; } = string.Empty;

        /// <summary>Display name.</summary>
        public string Name { get; internal set; } = string.Empty;

        /// <summary>When the NPC stands here.</summary>
        public NpcMarkerPhase Phase { get; internal set; }

        /// <summary>Location id.</summary>
        public string LocationId { get; internal set; } = string.Empty;

        /// <summary>Position.</summary>
        public LayoutPoint Position { get; internal set; }

        /// <summary>Facing in degrees.</summary>
        public double Yaw { get; internal set; }
    }
}
