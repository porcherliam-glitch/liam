namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// What the boss health bar shows (GDD 05: large bar with name and title at the bottom of the screen while a boss fight
    /// runs). Plain values for the HUD.
    /// </summary>
    public readonly struct BossBarState
    {
        /// <summary>Creates the state.</summary>
        /// <param name="bossId">Boss id.</param>
        /// <param name="displayName">Name, e.g. "Der Wachende Ritter".</param>
        /// <param name="title">Title, e.g. "Letzter Waechter der Eichenritter".</param>
        /// <param name="healthFraction">Health from 0 to 1.</param>
        /// <param name="phase">Phase (1-based).</param>
        /// <param name="phaseCount">Number of phases (for the marks on the bar).</param>
        /// <param name="visible">True while the bar is shown.</param>
        public BossBarState(string bossId, string displayName, string title, float healthFraction, int phase, int phaseCount, bool visible)
        {
            BossId = bossId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
            Title = title ?? string.Empty;
            HealthFraction = healthFraction < 0f ? 0f : healthFraction > 1f ? 1f : healthFraction;
            Phase = phase;
            PhaseCount = phaseCount;
            Visible = visible;
        }

        /// <summary>Boss id.</summary>
        public string BossId { get; }

        /// <summary>Display name.</summary>
        public string DisplayName { get; }

        /// <summary>Title line.</summary>
        public string Title { get; }

        /// <summary>Health from 0 to 1.</summary>
        public float HealthFraction { get; }

        /// <summary>Phase (1-based).</summary>
        public int Phase { get; }

        /// <summary>Number of phases.</summary>
        public int PhaseCount { get; }

        /// <summary>True while shown.</summary>
        public bool Visible { get; }

        /// <summary>Same state with another health and phase.</summary>
        /// <param name="healthFraction">Health from 0 to 1.</param>
        /// <param name="phase">Phase.</param>
        public BossBarState With(float healthFraction, int phase)
        {
            return new BossBarState(BossId, DisplayName, Title, healthFraction, phase, PhaseCount, Visible);
        }

        /// <summary>Same state, hidden.</summary>
        public BossBarState Hidden()
        {
            return new BossBarState(BossId, DisplayName, Title, HealthFraction, Phase, PhaseCount, false);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "BossBar(" + BossId + " " + (int)(HealthFraction * 100f + 0.5f) + "% P" + Phase + (Visible ? "" : " hidden") + ")";
        }
    }
}
