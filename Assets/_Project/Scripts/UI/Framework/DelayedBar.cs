using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Model of a resource bar with a delayed loss bar (GDD 05 1.2: "der Verlustbalken zieht nach 0,6 s nach"): after a loss
    /// the trail keeps showing the old value for the delay, then drains smoothly to the new value. Gains move both at once.
    /// Values are normalized (0..1). Pure logic.
    /// </summary>
    public sealed class DelayedBar
    {
        /// <summary>Delay before the trail follows a loss (s).</summary>
        public const float DefaultDelay = 0.6f;

        /// <summary>Speed of the trail in bar widths per second.</summary>
        public const float DefaultDrainPerSecond = 0.8f;

        private readonly float _delay;
        private readonly float _drainPerSecond;
        private float _wait;

        /// <summary>Creates the model (full bar).</summary>
        /// <param name="delay">Delay before the trail follows (s, 0 or more).</param>
        /// <param name="drainPerSecond">Trail speed in bar widths per second (&gt; 0).</param>
        public DelayedBar(float delay = DefaultDelay, float drainPerSecond = DefaultDrainPerSecond)
        {
            if (!(delay >= 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(delay), delay, "Must be 0 or more.");
            }

            if (!(drainPerSecond > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(drainPerSecond), drainPerSecond, "Must be greater than 0.");
            }

            _delay = delay;
            _drainPerSecond = drainPerSecond;
            Value = 1f;
            Trail = 1f;
        }

        /// <summary>Current value (front bar), 0..1.</summary>
        public float Value { get; private set; }

        /// <summary>Delayed value (loss bar behind the front bar), always at least <see cref="Value"/>.</summary>
        public float Trail { get; private set; }

        /// <summary>Sets both bars without animation (new target, loaded game).</summary>
        /// <param name="value">Normalized value.</param>
        public void Snap(float value)
        {
            Value = Clamp(value);
            Trail = Value;
            _wait = 0f;
        }

        /// <summary>Sets a new value; a loss starts (or restarts) the delay of the trail.</summary>
        /// <param name="value">Normalized value.</param>
        public void SetValue(float value)
        {
            float clamped = Clamp(value);
            if (clamped < Value)
            {
                _wait = _delay;
            }

            Value = clamped;
            if (Trail < Value)
            {
                Trail = Value;
            }
        }

        /// <summary>Advances the trail animation.</summary>
        /// <param name="deltaTime">Frame time in seconds.</param>
        public void Update(float deltaTime)
        {
            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            if (Trail <= Value)
            {
                Trail = Value;
                return;
            }

            if (_wait > 0f)
            {
                _wait -= dt;
                if (_wait > 0f)
                {
                    return;
                }

                dt = -_wait;
                _wait = 0f;
            }

            Trail = Math.Max(Value, Trail - _drainPerSecond * dt);
        }

        private static float Clamp(float value)
        {
            return float.IsNaN(value) ? 0f : Math.Max(0f, Math.Min(1f, value));
        }
    }
}
