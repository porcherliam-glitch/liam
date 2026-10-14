namespace Aetherfall.World.Dungeons
{
    /// <summary>A boss phase of the layout: number, health share where it starts, number of summoned adds.</summary>
    public sealed class DungeonBossPhase
    {
        /// <summary>Phase number (1-based).</summary>
        public int Phase { get; set; } = 1;

        /// <summary>The phase starts when the health falls below this share (phase 1: 1.0).</summary>
        public float FromHealth { get; set; } = 1f;

        /// <summary>Adds summoned when the phase starts.</summary>
        public int Summon { get; set; }
    }
}
