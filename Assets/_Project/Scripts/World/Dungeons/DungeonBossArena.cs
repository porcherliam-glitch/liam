using System.Collections.Generic;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// The boss arena of a dungeon (GDD 03 9.6: closed arena of at least 25 × 25 m, 2–4 covers, at least one environment
    /// mechanic): boss id, name and title for the boss bar, start position, encounter area, gates, covers, the arena mirror with
    /// its beam (GDD 02 11.7, phase 2: the beam stuns the knight for 5 s), phases, summoned adds, loot and reward.
    /// </summary>
    public sealed class DungeonBossArena
    {
        /// <summary>Arena id, e.g. <c>arena.eichental.gruft_siegelkammer</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Room of the arena.</summary>
        public string Room { get; set; } = string.Empty;

        /// <summary>Boss id, e.g. <c>boss.eichental.wachender_ritter</c>.</summary>
        public string BossId { get; set; } = string.Empty;

        /// <summary>Name on the boss bar.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Title on the boss bar.</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>Base enemy type (champion variant of it).</summary>
        public string EnemyType { get; set; } = string.Empty;

        /// <summary>Variant of the base type (champion).</summary>
        public string Variant { get; set; } = DungeonEnemy.Champion;

        /// <summary>Start position x.</summary>
        public float X { get; set; }

        /// <summary>Start position z.</summary>
        public float Z { get; set; }

        /// <summary>Start yaw.</summary>
        public float Yaw { get; set; }

        /// <summary>The fight starts when the player enters this rectangle.</summary>
        public DungeonRect EncounterArea { get; set; }

        /// <summary>Doors that close while the fight runs.</summary>
        public List<string> CloseGates { get; } = new List<string>();

        /// <summary>Cover objects (pillars).</summary>
        public List<string> Covers { get; } = new List<string>();

        /// <summary>Arena mirror object.</summary>
        public string Mirror { get; set; } = string.Empty;

        /// <summary>Start position of the arena mirror.</summary>
        public GridDirection MirrorStart { get; set; } = GridDirection.West;

        /// <summary>Beam source object of the arena.</summary>
        public string BeamSource { get; set; } = string.Empty;

        /// <summary>Direction the arena source shines in.</summary>
        public GridDirection BeamSourceDirection { get; set; } = GridDirection.West;

        /// <summary>First phase in which the beam shines.</summary>
        public int BeamFromPhase { get; set; } = 2;

        /// <summary>Stun duration of a beam hit in seconds (GDD 02 11.7: 5 s).</summary>
        public float BeamStunSeconds { get; set; } = 5f;

        /// <summary>Time until the beam can stun again in seconds (Vorschlag).</summary>
        public float BeamCooldownSeconds { get; set; } = 8f;

        /// <summary>Phases in order.</summary>
        public List<DungeonBossPhase> Phases { get; } = new List<DungeonBossPhase>();

        /// <summary>Adds summoned in later phases (inactive until then).</summary>
        public List<DungeonEnemy> Adds { get; } = new List<DungeonEnemy>();

        /// <summary>Loot table of the random part (GDD 04 5.7: 1 × LQ 3).</summary>
        public string LootTable { get; set; } = string.Empty;

        /// <summary>Guaranteed reward object (blade fragment) that appears when the boss falls.</summary>
        public string Reward { get; set; } = string.Empty;

        /// <summary>The seal stone object (taken in s60).</summary>
        public string SealStone { get; set; } = string.Empty;

        /// <summary>Music id (GDD 02 11.7: <c>mus.boss_gruft</c>).</summary>
        public string Music { get; set; } = string.Empty;
    }
}
