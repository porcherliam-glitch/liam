using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// "Halten zum Bestaetigen" (GDD 05 1.4): destructive actions (back to the main menu, quit, load over the current game)
    /// are confirmed by holding Confirm for 1.0 s (option 0.5–1.5 s); the progress is shown on the button, releasing early
    /// cancels. Works for the gamepad/keyboard Confirm button and for the mouse button alike. Pure logic.
    /// </summary>
    public sealed class HoldToConfirm
    {
        /// <summary>Default hold duration in seconds (GDD 05 1.4).</summary>
        public const float DefaultDuration = 1f;

        /// <summary>Shortest selectable hold duration.</summary>
        public const float MinDuration = 0.5f;

        /// <summary>Longest selectable hold duration.</summary>
        public const float MaxDuration = 1.5f;

        private float _elapsed;
        private float _duration = DefaultDuration;

        /// <summary>Creates the hold timer.</summary>
        /// <param name="duration">Hold duration in seconds (clamped to 0.5–1.5).</param>
        public HoldToConfirm(float duration = DefaultDuration)
        {
            Duration = duration;
        }

        /// <summary>Hold duration in seconds, clamped to <see cref="MinDuration"/>–<see cref="MaxDuration"/>.</summary>
        public float Duration
        {
            get => _duration;
            set => _duration = float.IsNaN(value) ? DefaultDuration : Math.Max(MinDuration, Math.Min(MaxDuration, value));
        }

        /// <summary>True while a hold runs.</summary>
        public bool IsHolding { get; private set; }

        /// <summary>Item the running hold belongs to (-1 if none).</summary>
        public int Target { get; private set; } = -1;

        /// <summary>Progress of the running hold from 0 to 1.</summary>
        public float Progress => IsHolding ? Math.Min(1f, _elapsed / _duration) : 0f;

        /// <summary>Starts a hold on an item (restarts if another item was held).</summary>
        /// <param name="target">Item index.</param>
        public void Begin(int target)
        {
            IsHolding = true;
            Target = target;
            _elapsed = 0f;
        }

        /// <summary>Advances the running hold.</summary>
        /// <param name="held">True while the button is still held.</param>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <returns>What happened in this frame.</returns>
        public HoldStep Update(bool held, float deltaTime)
        {
            if (!IsHolding)
            {
                return HoldStep.Idle;
            }

            if (!held)
            {
                Cancel();
                return HoldStep.Cancelled;
            }

            _elapsed += float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            if (_elapsed >= _duration)
            {
                IsHolding = false;
                Target = -1;
                _elapsed = 0f;
                return HoldStep.Completed;
            }

            return HoldStep.Progressed;
        }

        /// <summary>Stops the running hold without confirming.</summary>
        public void Cancel()
        {
            IsHolding = false;
            Target = -1;
            _elapsed = 0f;
        }
    }
}
