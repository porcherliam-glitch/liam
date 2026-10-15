using System;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Timing of the Aether shell (pure logic of <see cref="AetherShell"/>): intact → broken (exposed for a while) → growing back
    /// (visible, not yet protecting) → intact. While intact the boss takes <see cref="DamageFactor"/> of the damage.
    /// </summary>
    public sealed class AetherShellState
    {
        private readonly float _shieldedFactor;
        private readonly float _exposedSeconds;
        private readonly float _regrowSeconds;
        private float _exposed;
        private float _regrow = -1f;

        /// <summary>Creates an intact shell.</summary>
        /// <param name="shieldedFactor">Damage factor while intact (0 … 1).</param>
        /// <param name="exposedSeconds">Time without shell after a break.</param>
        /// <param name="regrowSeconds">Time the shell needs to grow back.</param>
        public AetherShellState(float shieldedFactor, float exposedSeconds, float regrowSeconds)
        {
            if (!(shieldedFactor >= 0f) || shieldedFactor > 1f)
            {
                throw new ArgumentOutOfRangeException(nameof(shieldedFactor));
            }

            if (!(exposedSeconds > 0f) || !(regrowSeconds > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(exposedSeconds), "Times must be positive.");
            }

            _shieldedFactor = shieldedFactor;
            _exposedSeconds = exposedSeconds;
            _regrowSeconds = regrowSeconds;
            IsIntact = true;
        }

        /// <summary>True while the shell protects.</summary>
        public bool IsIntact { get; private set; }

        /// <summary>True while the shell grows back (visible, not protecting).</summary>
        public bool IsRegrowing => _regrow >= 0f;

        /// <summary>Size of the growing shell from 0 to 1 (1 when intact, 0 while broken).</summary>
        public float GrowFraction => IsIntact ? 1f : IsRegrowing ? Math.Min(1f, _regrow / _regrowSeconds) : 0f;

        /// <summary>Damage factor right now.</summary>
        public float DamageFactor => IsIntact ? _shieldedFactor : 1f;

        /// <summary>Breaks an intact shell.</summary>
        /// <returns>True if it was intact.</returns>
        public bool TryBreak()
        {
            if (!IsIntact)
            {
                return false;
            }

            IsIntact = false;
            _exposed = _exposedSeconds;
            _regrow = -1f;
            return true;
        }

        /// <summary>Advances the time.</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <returns>True if the shell holds again after this step.</returns>
        public bool Tick(float deltaTime)
        {
            if (IsIntact || !(deltaTime > 0f))
            {
                return false;
            }

            if (_regrow < 0f)
            {
                _exposed -= deltaTime;
                if (_exposed > 0f)
                {
                    return false;
                }

                // The rest of the step already counts for growing.
                _regrow = -_exposed;
            }
            else
            {
                _regrow += deltaTime;
            }

            if (_regrow >= _regrowSeconds)
            {
                Restore();
                return true;
            }

            return false;
        }

        /// <summary>Intact again at once (respawn).</summary>
        public void Restore()
        {
            IsIntact = true;
            _regrow = -1f;
            _exposed = 0f;
        }
    }
}
