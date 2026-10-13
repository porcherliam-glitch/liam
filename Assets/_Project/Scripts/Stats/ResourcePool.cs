using System;

namespace Aetherfall.Stats
{
    /// <summary>
    /// A consumable resource such as health, stamina or mana (GDD 03 4.3, 10.3): current value, maximum (fixed or from a
    /// stat), regeneration after a delay, and an "exhausted" lock after it was spent down to 0.
    /// </summary>
    /// <remarks>
    /// <para><b>Spending rule (GDD 03 4.3):</b> an action is allowed while the value is above 0; its cost may lower the
    /// value to 0, never below (<see cref="TrySpend"/>). Minimum values to start something (e.g. sprint from 10) are the
    /// caller's rule (<see cref="HasAtLeast"/>).</para>
    /// <para><b>Regeneration:</b> <see cref="Tick"/> adds <see cref="RegenPerSecond"/> once <see cref="ResourcePoolSettings.RegenDelay"/>
    /// seconds have passed since the last spending. The part of a frame before the delay ends does not count, so the result
    /// does not depend on the frame rate.</para>
    /// <para><b>Maximum from a stat:</b> the maximum follows the stat (equipment, level-up); if it drops below the current
    /// value, the current value is capped. Pure C#, allocation-free, main thread only.</para>
    /// </remarks>
    public sealed class ResourcePool
    {
        private readonly StatCollection _stats;
        private readonly StatId _maxStat;
        private readonly StatId _regenStat;
        private float _fixedMax;
        private float _current;
        private float _timeSinceSpend = float.PositiveInfinity;
        private float _exhaustedRemaining;

        /// <summary>Creates a pool with a fixed maximum, starting full.</summary>
        /// <param name="max">Maximum (at least 0).</param>
        /// <param name="settings">Regeneration and exhaustion rules.</param>
        public ResourcePool(float max, in ResourcePoolSettings settings)
        {
            _fixedMax = Math.Max(0f, max);
            Settings = settings;
            _current = _fixedMax;
        }

        /// <summary>Creates a pool whose maximum (and optionally flat regeneration) comes from stats, starting full.</summary>
        /// <param name="stats">Stats of the owner.</param>
        /// <param name="maxStat">Stat with the maximum, e.g. <see cref="StatId.MaxStamina"/>.</param>
        /// <param name="settings">Regeneration and exhaustion rules.</param>
        /// <param name="regenStat">Stat with the flat regeneration per second (replaces <see cref="ResourcePoolSettings.RegenPerSecond"/>), or None.</param>
        public ResourcePool(StatCollection stats, StatId maxStat, in ResourcePoolSettings settings, StatId regenStat = StatId.None)
        {
            _stats = stats ?? throw new ArgumentNullException(nameof(stats));
            _maxStat = maxStat;
            _regenStat = regenStat;
            Settings = settings;
            _current = Max;
        }

        /// <summary>Raised whenever <see cref="Current"/> changes (spend, restore, regeneration, load).</summary>
        public event Action<ResourcePool> Changed;

        /// <summary>Regeneration and exhaustion rules.</summary>
        public ResourcePoolSettings Settings { get; }

        /// <summary>Maximum value (from the stat, if bound).</summary>
        public float Max => _stats != null ? Math.Max(0f, _stats.Get(_maxStat)) : _fixedMax;

        /// <summary>Current value, 0 to <see cref="Max"/>.</summary>
        public float Current
        {
            get
            {
                float max = Max;
                return _current > max ? max : _current;
            }
        }

        /// <summary>Current value relative to the maximum (0–1; 0 if the maximum is 0).</summary>
        public float Normalized
        {
            get
            {
                float max = Max;
                return max > 0f ? Current / max : 0f;
            }
        }

        /// <summary>True at 0.</summary>
        public bool IsEmpty => !(Current > 0f);

        /// <summary>True at the maximum.</summary>
        public bool IsFull => Current >= Max;

        /// <summary>True while the exhaustion lock runs (spent down to 0 less than <see cref="ResourcePoolSettings.ExhaustionDuration"/> ago).</summary>
        public bool IsExhausted => _exhaustedRemaining > 0f;

        /// <summary>Remaining seconds of the exhaustion lock.</summary>
        public float ExhaustedRemaining => _exhaustedRemaining;

        /// <summary>Seconds since the last spending (infinity if never spent since creation or load).</summary>
        public float TimeSinceSpend => _timeSinceSpend;

        /// <summary>Factor on the regeneration (0 = none, e.g. health in combat; 0.5 = halved while blocking). Default 1.</summary>
        public float RegenMultiplier { get; set; } = 1f;

        /// <summary>Regeneration per second with the current maximum and multiplier.</summary>
        public float RegenPerSecond
        {
            get
            {
                float flat = _regenStat != StatId.None && _stats != null ? _stats.Get(_regenStat) : Settings.RegenPerSecond;
                return Math.Max(0f, (flat + Settings.RegenFractionOfMaxPerSecond * Max) * RegenMultiplier);
            }
        }

        /// <summary>Changes the fixed maximum (pools without stat binding). The current value is capped.</summary>
        /// <param name="max">New maximum (at least 0).</param>
        /// <exception cref="InvalidOperationException">The maximum comes from a stat.</exception>
        public void SetFixedMax(float max)
        {
            if (_stats != null)
            {
                throw new InvalidOperationException("The maximum of this pool comes from the stat " + _maxStat + ".");
            }

            float before = Current;
            _fixedMax = Math.Max(0f, max);
            NotifyIfChanged(before);
        }

        /// <summary>True if at least <paramref name="amount"/> is available (e.g. sprint needs 10 to start).</summary>
        /// <param name="amount">Required amount.</param>
        public bool HasAtLeast(float amount)
        {
            return Current >= amount;
        }

        /// <summary>
        /// Pays the cost of an action if the value is above 0 (GDD 03 4.3); the value never drops below 0.
        /// </summary>
        /// <param name="cost">Cost of the action.</param>
        /// <returns>True if the action may happen (and the cost was paid).</returns>
        public bool TrySpend(float cost)
        {
            if (IsEmpty)
            {
                return false;
            }

            Spend(cost);
            return true;
        }

        /// <summary>
        /// Lowers the value by <paramref name="amount"/> (at most to 0), restarts the regeneration delay and starts the
        /// exhaustion lock if the value reached 0.
        /// </summary>
        /// <param name="amount">Amount; 0 or less does nothing.</param>
        /// <returns>The amount actually removed.</returns>
        public float Spend(float amount)
        {
            if (!(amount > 0f))
            {
                return 0f;
            }

            float before = Current;
            _current = Math.Max(0f, before - amount);
            _timeSinceSpend = 0f;
            if (before > 0f && !(_current > 0f) && Settings.ExhaustionDuration > 0f)
            {
                _exhaustedRemaining = Settings.ExhaustionDuration;
            }

            NotifyIfChanged(before);
            return before - _current;
        }

        /// <summary>Raises the value by <paramref name="amount"/> (at most to the maximum). Does not touch the delay.</summary>
        /// <param name="amount">Amount; 0 or less does nothing.</param>
        /// <returns>The amount actually added.</returns>
        public float Restore(float amount)
        {
            if (!(amount > 0f))
            {
                return 0f;
            }

            float before = Current;
            _current = Math.Min(Max, before + amount);
            NotifyIfChanged(before);
            return _current - before;
        }

        /// <summary>Sets the value to the maximum.</summary>
        public void Refill()
        {
            float before = Current;
            _current = Max;
            NotifyIfChanged(before);
        }

        /// <summary>
        /// Sets the value directly (loading a save, respawn): clamped to 0..max, clears the exhaustion lock and the
        /// regeneration delay. No gameplay rule runs.
        /// </summary>
        /// <param name="value">New value.</param>
        public void SetCurrent(float value)
        {
            float before = Current;
            _current = Math.Max(0f, Math.Min(Max, value));
            _exhaustedRemaining = 0f;
            _timeSinceSpend = float.PositiveInfinity;
            NotifyIfChanged(before);
        }

        /// <summary>Advances timers and regeneration.</summary>
        /// <param name="deltaTime">Seconds since the last tick (0 or less does nothing).</param>
        public void Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return;
            }

            if (_exhaustedRemaining > 0f)
            {
                _exhaustedRemaining = Math.Max(0f, _exhaustedRemaining - deltaTime);
            }

            if (float.IsPositiveInfinity(_timeSinceSpend))
            {
                Regenerate(deltaTime);
                return;
            }

            _timeSinceSpend += deltaTime;
            float active = Math.Min(deltaTime, _timeSinceSpend - Settings.RegenDelay);
            if (active > 0f)
            {
                Regenerate(active);
            }
        }

        private void Regenerate(float seconds)
        {
            float max = Max;
            if (Current >= max)
            {
                return;
            }

            float rate = RegenPerSecond;
            if (rate > 0f)
            {
                float before = Current;
                _current = Math.Min(max, before + rate * seconds);
                NotifyIfChanged(before);
            }
        }

        private void NotifyIfChanged(float before)
        {
            if (Current.Equals(before))
            {
                return;
            }

            Action<ResourcePool> handler = Changed;
            if (handler != null)
            {
                handler(this);
            }
        }
    }
}
