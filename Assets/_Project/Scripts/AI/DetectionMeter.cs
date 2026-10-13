using System;

namespace Aetherfall.AI
{
    /// <summary>
    /// Detection value 0–100 of one enemy (GDD 03 9.2): rises with the sight rate, jumps on instant detection and heard
    /// noises, falls by 20 per second after 2 s without sight (slower while suspicious). From 30 the enemy is suspicious,
    /// at 100 it fights. Pure logic.
    /// </summary>
    public sealed class DetectionMeter
    {
        private float _timeWithoutSight = float.PositiveInfinity;

        /// <summary>Creates the meter.</summary>
        /// <param name="decayPerSecond">Decay after the delay (GDD 03: 20 per second).</param>
        /// <param name="decayDelay">Seconds without sight before the decay starts (GDD 03: 2).</param>
        public DetectionMeter(float decayPerSecond = 20f, float decayDelay = 2f)
        {
            DecayPerSecond = Math.Max(0f, decayPerSecond);
            DecayDelay = Math.Max(0f, decayDelay);
        }

        /// <summary>Decay per second.</summary>
        public float DecayPerSecond { get; }

        /// <summary>Delay before the decay.</summary>
        public float DecayDelay { get; }

        /// <summary>Current value 0–100.</summary>
        public float Value { get; private set; }

        /// <summary>Seconds since the target was last seen.</summary>
        public float TimeWithoutSight => _timeWithoutSight;

        /// <summary>Advances the meter.</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <param name="sightRate">Detection gain per second while the target is visible (0 = not visible).</param>
        /// <param name="instant">The target was noticed at once (near zone).</param>
        /// <param name="noiseValue">Value a heard noise sets at least (0 = none).</param>
        /// <param name="decayFactor">Factor on the decay (suspicious: 0.5 = "sinkt langsamer").</param>
        public void Update(float deltaTime, float sightRate, bool instant, float noiseValue, float decayFactor = 1f)
        {
            float dt = deltaTime > 0f ? deltaTime : 0f;
            if (instant)
            {
                Value = 100f;
                _timeWithoutSight = 0f;
            }
            else if (sightRate > 0f)
            {
                Value = Math.Min(100f, Value + sightRate * dt);
                _timeWithoutSight = 0f;
            }
            else
            {
                _timeWithoutSight = float.IsPositiveInfinity(_timeWithoutSight) ? dt : _timeWithoutSight + dt;
                if (_timeWithoutSight > DecayDelay)
                {
                    Value = Math.Max(0f, Value - DecayPerSecond * Math.Max(0f, decayFactor) * dt);
                }
            }

            if (noiseValue > Value)
            {
                Value = Math.Min(100f, noiseValue);
            }
        }

        /// <summary>Sets the value at once (hit by the target: 100).</summary>
        /// <param name="value">New value.</param>
        public void Set(float value)
        {
            Value = Math.Max(0f, Math.Min(100f, value));
            if (Value >= 100f)
            {
                _timeWithoutSight = 0f;
            }
        }

        /// <summary>Back to 0 (returned to the anchor, respawn).</summary>
        public void Reset()
        {
            Value = 0f;
            _timeWithoutSight = float.PositiveInfinity;
        }
    }
}
