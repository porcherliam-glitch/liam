using System;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Source of the boss health bar (GDD 05): the <see cref="BossController"/> shows, updates and hides it; the HUD (or the
    /// placeholder <see cref="BossBarOverlay"/>) reads <see cref="Current"/> and listens to <see cref="Changed"/>. One boss
    /// at a time. Registered by <see cref="BossInstaller"/>.
    /// </summary>
    public interface IBossBarService
    {
        /// <summary>Current state (not visible when no fight runs).</summary>
        BossBarState Current { get; }

        /// <summary>Raised after every change (main thread).</summary>
        event Action<BossBarState> Changed;

        /// <summary>Shows the bar of a boss.</summary>
        /// <param name="state">State (visible).</param>
        void Show(in BossBarState state);

        /// <summary>Updates health and phase of the shown boss (ignored for another boss or when hidden).</summary>
        /// <param name="bossId">Boss id.</param>
        /// <param name="healthFraction">Health from 0 to 1.</param>
        /// <param name="phase">Phase.</param>
        void UpdateHealth(string bossId, float healthFraction, int phase);

        /// <summary>Hides the bar of a boss (ignored for another boss).</summary>
        /// <param name="bossId">Boss id.</param>
        void Hide(string bossId);
    }
}
