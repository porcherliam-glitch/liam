// Global events of boss fights (architecture 4.3, "Weitere verbindliche Event-Namen", area Kampf: BossEncounterStarted and
// BossEncounterEnded "fuer Boss-Lebensbalken (§20.3) und Boss-Musik"; BossPhaseChanged for music layers per phase and arena
// mechanics, GDD 03 9.6 "Schicht je Phase"). BossDefeated lives in EncounterEvents.cs. Sender: AI (boss controllers).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A boss fight started (the player entered the arena, the arena closes). Receivers: UI (boss health bar), audio (boss
    /// music, GDD 05 2.1 "Boss-Arena betreten"), world (arena gates, save lock "Boss-Arena", architecture 9.8).
    /// </summary>
    public readonly struct BossEncounterStarted : IGameEvent
    {
        /// <summary>Boss id, e.g. <c>boss.eichental.wachender_ritter</c>.</summary>
        public readonly string BossId;

        /// <summary>Creates the event.</summary>
        /// <param name="bossId">Boss id.</param>
        public BossEncounterStarted(string bossId)
        {
            BossId = bossId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossEncounterStarted(" + BossId + ")";
        }
    }

    /// <summary>
    /// A boss fight ended: the boss was beaten (<see cref="Defeated"/>) or the fight was reset (player died, encounter
    /// aborted). Receivers: UI (hide the boss bar), audio (victory stinger or back to exploration), world (open the arena).
    /// </summary>
    public readonly struct BossEncounterEnded : IGameEvent
    {
        /// <summary>Boss id.</summary>
        public readonly string BossId;

        /// <summary>True if the boss was beaten; false if the fight was reset.</summary>
        public readonly bool Defeated;

        /// <summary>Creates the event.</summary>
        /// <param name="bossId">Boss id.</param>
        /// <param name="defeated">True if the boss was beaten.</param>
        public BossEncounterEnded(string bossId, bool defeated)
        {
            BossId = bossId ?? string.Empty;
            Defeated = defeated;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossEncounterEnded(" + BossId + ", defeated=" + Defeated + ")";
        }
    }

    /// <summary>
    /// A boss entered a new phase (GDD 03 9.6: phases at health thresholds). Phase 1 is the first phase; the event is sent
    /// when the transition starts. Receivers: audio (layer per phase), world (arena mechanics such as the Aether beam of the
    /// forgotten crypt, GDD 02 11.7), UI (phase marks).
    /// </summary>
    public readonly struct BossPhaseChanged : IGameEvent
    {
        /// <summary>Boss id.</summary>
        public readonly string BossId;

        /// <summary>New phase, 1-based.</summary>
        public readonly int Phase;

        /// <summary>Creates the event.</summary>
        /// <param name="bossId">Boss id.</param>
        /// <param name="phase">New phase (1-based).</param>
        public BossPhaseChanged(string bossId, int phase)
        {
            BossId = bossId ?? string.Empty;
            Phase = phase;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossPhaseChanged(" + BossId + ", phase " + Phase + ")";
        }
    }

    /// <summary>
    /// A boss was bound alive instead of killed (GDD 02 11.6 Grimmbart: "Fesseln" at 10 % health). Published right before
    /// <c>BossDefeated</c>. Receivers: quests (branch "lebend"), world.
    /// </summary>
    public readonly struct BossSubdued : IGameEvent
    {
        /// <summary>Boss id, e.g. <c>boss.eichental.grimmbart</c>.</summary>
        public readonly string BossId;

        /// <summary>Creates the event.</summary>
        /// <param name="bossId">Boss id.</param>
        public BossSubdued(string bossId)
        {
            BossId = bossId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossSubdued(" + BossId + ")";
        }
    }
}
