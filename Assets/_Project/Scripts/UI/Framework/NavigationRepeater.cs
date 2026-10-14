using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Turns the analog navigation value of the UI map (stick, D-pad, WASD, arrows) into discrete focus steps (GDD 05 1.4,
    /// architecture 4.9): one step when the direction is pressed, then auto-repeat after 0.4 s with 12 steps per second.
    /// Pure logic; the caller passes real (unscaled) time, so menus also navigate while the game is paused.
    /// </summary>
    /// <remarks>
    /// After <see cref="BlockUntilNeutral"/> a direction that is still held (the player was walking with W or the stick when a
    /// screen opened; UI/Navigate is a value action and reports it at once) is ignored until the input was neutral once.
    /// </remarks>
    public sealed class NavigationRepeater
    {
        /// <summary>Deflection from which a direction counts as pressed (GDD 05 1.5: stick above 50 %).</summary>
        public const float DefaultThreshold = 0.5f;

        /// <summary>Hold time before auto-repeat starts in seconds (GDD 05 1.4).</summary>
        public const float DefaultInitialDelay = 0.4f;

        /// <summary>Auto-repeat steps per second (GDD 05 1.4).</summary>
        public const float DefaultStepsPerSecond = 12f;

        private readonly float _threshold;
        private readonly float _initialDelay;
        private readonly float _repeatInterval;
        private NavDirection _held = NavDirection.None;
        private float _timer;
        private bool _waitForNeutral;

        /// <summary>Creates a repeater with the values of GDD 05 1.4 unless others are given.</summary>
        /// <param name="threshold">Deflection from which a direction counts (0..1, exclusive).</param>
        /// <param name="initialDelay">Seconds until auto-repeat (&gt; 0).</param>
        /// <param name="stepsPerSecond">Auto-repeat rate (&gt; 0).</param>
        public NavigationRepeater(float threshold = DefaultThreshold, float initialDelay = DefaultInitialDelay, float stepsPerSecond = DefaultStepsPerSecond)
        {
            if (!(threshold > 0f) || threshold >= 1f)
            {
                throw new ArgumentOutOfRangeException(nameof(threshold), threshold, "Must be between 0 and 1.");
            }

            if (!(initialDelay > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(initialDelay), initialDelay, "Must be greater than 0.");
            }

            if (!(stepsPerSecond > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(stepsPerSecond), stepsPerSecond, "Must be greater than 0.");
            }

            _threshold = threshold;
            _initialDelay = initialDelay;
            _repeatInterval = 1f / stepsPerSecond;
        }

        /// <summary>Direction currently held (None if released).</summary>
        public NavDirection Held => _held;

        /// <summary>True while a held direction is ignored until the input was neutral once (<see cref="BlockUntilNeutral"/>).</summary>
        public bool WaitsForNeutral => _waitForNeutral;

        /// <summary>Returns the dominant direction of a navigation value, or None below the threshold.</summary>
        /// <param name="x">Horizontal value (-1 left .. 1 right).</param>
        /// <param name="y">Vertical value (-1 down .. 1 up).</param>
        /// <param name="threshold">Deflection from which a direction counts.</param>
        public static NavDirection DirectionOf(float x, float y, float threshold = DefaultThreshold)
        {
            float ax = float.IsNaN(x) ? 0f : Math.Abs(x);
            float ay = float.IsNaN(y) ? 0f : Math.Abs(y);
            if (ax < threshold && ay < threshold)
            {
                return NavDirection.None;
            }

            if (ay >= ax)
            {
                return y > 0f ? NavDirection.Up : NavDirection.Down;
            }

            return x > 0f ? NavDirection.Right : NavDirection.Left;
        }

        /// <summary>Advances by one frame.</summary>
        /// <param name="x">Horizontal navigation value of this frame.</param>
        /// <param name="y">Vertical navigation value of this frame.</param>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <returns>The step to perform this frame, or None.</returns>
        public NavDirection Update(float x, float y, float deltaTime)
        {
            NavDirection direction = DirectionOf(x, y, _threshold);
            if (_waitForNeutral)
            {
                if (direction == NavDirection.None)
                {
                    _waitForNeutral = false;
                }

                return NavDirection.None;
            }

            if (direction == NavDirection.None)
            {
                Reset();
                return NavDirection.None;
            }

            if (direction != _held)
            {
                _held = direction;
                _timer = _initialDelay;
                return direction;
            }

            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            _timer -= dt;
            if (_timer > 0f)
            {
                return NavDirection.None;
            }

            // At most one step per frame; the remainder carries over so the rate stays 12 steps per second at 60 FPS and above.
            _timer += _repeatInterval;
            if (_timer < 0f)
            {
                _timer = 0f;
            }

            return direction;
        }

        /// <summary>Forgets the held direction. Does not lift a <see cref="BlockUntilNeutral"/> block.</summary>
        public void Reset()
        {
            _held = NavDirection.None;
            _timer = 0f;
        }

        /// <summary>
        /// Forgets the held direction and ignores the navigation input until it was neutral once (a screen opened or closed:
        /// a direction held from the game must not move the focus).
        /// </summary>
        public void BlockUntilNeutral()
        {
            Reset();
            _waitForNeutral = true;
        }
    }
}
