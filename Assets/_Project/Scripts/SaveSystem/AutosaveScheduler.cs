using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Timing rules of autosaves (GDD 05 5.3, architecture 9.6) as pure logic:
    /// <list type="bullet">
    /// <item>interval (default 10 min), counted only while the playtime runs (table 4.4);</item>
    /// <item>event triggers (quest progress, region change … in later steps) call <see cref="Request"/>;</item>
    /// <item>at most one autosave per 60 s; a request waits until the gap has passed;</item>
    /// <item>while saving is locked, a request waits up to 120 s, then it is dropped;</item>
    /// <item>every save (also manual and quick saves) resets the interval (<see cref="NotifySaved"/>).</item>
    /// </list>
    /// </summary>
    public sealed class AutosaveScheduler
    {
        /// <summary>Default interval in seconds (10 min).</summary>
        public const float DefaultIntervalSeconds = 600f;

        /// <summary>Default minimum time between two autosaves in seconds.</summary>
        public const float DefaultMinimumGapSeconds = 60f;

        /// <summary>Default time a locked request waits before it is dropped, in seconds.</summary>
        public const float DefaultDeferLimitSeconds = 120f;

        private float _intervalElapsed;
        private float _sinceLastSave = float.PositiveInfinity;
        private float _deferred;
        private bool _pending;

        /// <summary>Creates the scheduler.</summary>
        /// <param name="intervalSeconds">Interval; 0 or less disables the interval trigger.</param>
        /// <param name="minimumGapSeconds">Minimum time between two autosaves.</param>
        /// <param name="deferLimitSeconds">How long a locked request waits.</param>
        public AutosaveScheduler(float intervalSeconds = DefaultIntervalSeconds, float minimumGapSeconds = DefaultMinimumGapSeconds,
            float deferLimitSeconds = DefaultDeferLimitSeconds)
        {
            IntervalSeconds = intervalSeconds;
            MinimumGapSeconds = Math.Max(0f, minimumGapSeconds);
            DeferLimitSeconds = Math.Max(0f, deferLimitSeconds);
        }

        /// <summary>Interval in seconds (0 or less = no interval trigger).</summary>
        public float IntervalSeconds { get; set; }

        /// <summary>Minimum time between two autosaves in seconds.</summary>
        public float MinimumGapSeconds { get; }

        /// <summary>How long a locked request waits in seconds.</summary>
        public float DeferLimitSeconds { get; }

        /// <summary>False disables all autosaves.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>True while a request waits.</summary>
        public bool IsPending => _pending;

        /// <summary>Playtime seconds counted towards the next interval autosave.</summary>
        public float IntervalElapsed => _intervalElapsed;

        /// <summary>Requests an autosave (event triggers). Several requests before the save collapse into one.</summary>
        public void Request()
        {
            if (!_pending)
            {
                _pending = true;
                _deferred = 0f;
            }
        }

        /// <summary>A save was written (any kind): resets the interval and the gap timer, clears a pending request.</summary>
        public void NotifySaved()
        {
            _intervalElapsed = 0f;
            _sinceLastSave = 0f;
            _pending = false;
            _deferred = 0f;
        }

        /// <summary>Resets the interval (after loading a save), keeps the gap timer.</summary>
        public void ResetInterval()
        {
            _intervalElapsed = 0f;
            _pending = false;
            _deferred = 0f;
        }

        /// <summary>Advances the timers and decides.</summary>
        /// <param name="realDeltaTime">Real seconds since the last call.</param>
        /// <param name="playtimeRunning">True if the playtime counter runs in the current state (table 4.4).</param>
        /// <param name="saveAllowed">True if saving is allowed right now.</param>
        public AutosaveDecision Tick(float realDeltaTime, bool playtimeRunning, bool saveAllowed)
        {
            if (!Enabled || !(realDeltaTime > 0f))
            {
                return AutosaveDecision.None;
            }

            _sinceLastSave += realDeltaTime;
            if (playtimeRunning && IntervalSeconds > 0f)
            {
                _intervalElapsed += realDeltaTime;
                if (_intervalElapsed >= IntervalSeconds)
                {
                    _intervalElapsed = 0f;
                    Request();
                }
            }

            if (!_pending)
            {
                return AutosaveDecision.None;
            }

            if (!saveAllowed)
            {
                _deferred += realDeltaTime;
                if (_deferred > DeferLimitSeconds)
                {
                    _pending = false;
                    _deferred = 0f;
                    return AutosaveDecision.Discarded;
                }

                return AutosaveDecision.None;
            }

            if (_sinceLastSave < MinimumGapSeconds)
            {
                return AutosaveDecision.None;
            }

            _pending = false;
            _deferred = 0f;
            return AutosaveDecision.SaveNow;
        }
    }
}
