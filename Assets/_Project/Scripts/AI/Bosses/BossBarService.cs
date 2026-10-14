using System;
using Aetherfall.Core;

namespace Aetherfall.AI.Bosses
{
    /// <summary>Default <see cref="IBossBarService"/>: holds the state, raises <see cref="Changed"/> only on real changes. Pure logic.</summary>
    public sealed class BossBarService : IBossBarService, ISessionService
    {
        /// <inheritdoc />
        public BossBarState Current { get; private set; }

        /// <inheritdoc />
        public event Action<BossBarState> Changed;

        /// <inheritdoc />
        public void Show(in BossBarState state)
        {
            Set(new BossBarState(state.BossId, state.DisplayName, state.Title, state.HealthFraction, state.Phase, state.PhaseCount, true));
        }

        /// <inheritdoc />
        public void UpdateHealth(string bossId, float healthFraction, int phase)
        {
            BossBarState current = Current;
            if (!current.Visible || current.BossId != bossId)
            {
                return;
            }

            BossBarState next = current.With(healthFraction, phase);
            if (Math.Abs(next.HealthFraction - current.HealthFraction) < 0.0005f && next.Phase == current.Phase)
            {
                return;
            }

            Set(next);
        }

        /// <inheritdoc />
        public void Hide(string bossId)
        {
            BossBarState current = Current;
            if (!current.Visible || current.BossId != bossId)
            {
                return;
            }

            Set(current.Hidden());
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            if (Current.Visible)
            {
                Set(Current.Hidden());
            }
        }

        private void Set(BossBarState state)
        {
            Current = state;
            Action<BossBarState> changed = Changed;
            if (changed != null)
            {
                changed(state);
            }
        }
    }
}
