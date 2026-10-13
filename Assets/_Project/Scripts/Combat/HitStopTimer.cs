using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Local hitstop of one combatant (architecture 4.4 and 11.4: never <c>Time.timeScale</c>): freezes the combatant's own
    /// combat time for a few milliseconds while particles, sound and everybody else keep running. GDD 03 4.11: at most
    /// 150 ms in total within 0.5 s. The owner passes its frame time through <see cref="Tick"/> and uses the returned local
    /// time for its state machine, attack runner and movement. Pure logic, allocation-free.
    /// </summary>
    public sealed class HitStopTimer
    {
        private readonly float _maxTotal;
        private readonly float _window;
        private readonly float[] _grantTimes = new float[8];
        private readonly float[] _grantAmounts = new float[8];
        private float _clock;
        private float _remaining;
        private int _next;

        /// <summary>Creates the timer.</summary>
        /// <param name="maxTotalSeconds">Most hitstop inside the window (GDD 03: 0.15 s).</param>
        /// <param name="windowSeconds">Window (GDD 03: 0.5 s).</param>
        public HitStopTimer(float maxTotalSeconds = 0.15f, float windowSeconds = 0.5f)
        {
            _maxTotal = Math.Max(0f, maxTotalSeconds);
            _window = Math.Max(0.01f, windowSeconds);
        }

        /// <summary>True while frozen.</summary>
        public bool IsFrozen => _remaining > 0f;

        /// <summary>Seconds of freeze left.</summary>
        public float Remaining => _remaining;

        /// <summary>0 while frozen, otherwise 1 (e.g. for an Animator speed later).</summary>
        public float TimeScale => IsFrozen ? 0f : 1f;

        /// <summary>
        /// Requests a freeze. Extends a running one; the total inside the window is capped at the maximum.
        /// </summary>
        /// <param name="seconds">Requested duration (GDD 03 4.11: 0.04–0.12 s).</param>
        /// <returns>Seconds actually added.</returns>
        public float Request(float seconds)
        {
            if (!(seconds > 0f))
            {
                return 0f;
            }

            float used = 0f;
            for (int i = 0; i < _grantAmounts.Length; i++)
            {
                if (_grantAmounts[i] > 0f && _clock - _grantTimes[i] < _window)
                {
                    used += _grantAmounts[i];
                }
            }

            float wanted = Math.Max(0f, seconds - _remaining);
            float granted = Math.Min(wanted, Math.Max(0f, _maxTotal - used));
            if (granted <= 0f)
            {
                return 0f;
            }

            _remaining += granted;
            _grantTimes[_next] = _clock;
            _grantAmounts[_next] = granted;
            _next = (_next + 1) % _grantAmounts.Length;
            return granted;
        }

        /// <summary>Advances real time and returns the local (unfrozen) part of it.</summary>
        /// <param name="deltaTime">Frame time in seconds.</param>
        /// <returns>Local combat time of this frame (0 while frozen).</returns>
        public float Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return 0f;
            }

            _clock += deltaTime;
            if (_remaining <= 0f)
            {
                return deltaTime;
            }

            if (_remaining >= deltaTime)
            {
                _remaining -= deltaTime;
                return 0f;
            }

            float local = deltaTime - _remaining;
            _remaining = 0f;
            return local;
        }

        /// <summary>Ends a running freeze (death, respawn).</summary>
        public void Clear()
        {
            _remaining = 0f;
        }
    }
}
