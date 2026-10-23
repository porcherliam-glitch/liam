namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Holding the skip button during a cutscene (S58, GDD 03 1.5: A or Space held 1 s): a <see cref="HoldToConfirm"/> that only
    /// starts on a fresh press. A button that was already held when the screen opened (A from confirming "Neues Spiel", Space from
    /// a jump) never skips, and the frame after <see cref="Reset"/> is ignored. Releasing early cancels. Pure logic.
    /// </summary>
    /// <remarks>TODO (options step): the option "Halte-Eingaben als Umschalten" turns the hold into two presses here.</remarks>
    public sealed class CutsceneSkipHold
    {
        private readonly HoldToConfirm _hold;
        private bool _ignoreNextFrame = true;

        /// <summary>Creates the hold.</summary>
        /// <param name="duration">Hold duration in seconds (clamped to 0.5–1.5).</param>
        public CutsceneSkipHold(float duration = HoldToConfirm.DefaultDuration)
        {
            _hold = new HoldToConfirm(duration);
        }

        /// <summary>Hold duration in seconds (clamped to 0.5–1.5).</summary>
        public float Duration
        {
            get => _hold.Duration;
            set => _hold.Duration = value;
        }

        /// <summary>True while a hold runs.</summary>
        public bool IsHolding => _hold.IsHolding;

        /// <summary>Progress of the running hold from 0 to 1.</summary>
        public float Progress => _hold.Progress;

        /// <summary>Stops a running hold and ignores the next frame (the screen opened).</summary>
        public void Reset()
        {
            _hold.Cancel();
            _ignoreNextFrame = true;
        }

        /// <summary>Advances the hold by one frame.</summary>
        /// <param name="pressedThisFrame">True if the skip button went down in this frame.</param>
        /// <param name="held">True while the skip button is down.</param>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <returns>What happened; <see cref="HoldStep.Completed"/> means: skip now (once per hold).</returns>
        public HoldStep Update(bool pressedThisFrame, bool held, float deltaTime)
        {
            if (_ignoreNextFrame)
            {
                _ignoreNextFrame = false;
                return HoldStep.Idle;
            }

            if (!_hold.IsHolding)
            {
                if (!pressedThisFrame || !held)
                {
                    return HoldStep.Idle;
                }

                _hold.Begin(0);
                return HoldStep.Progressed;
            }

            return _hold.Update(held, deltaTime);
        }
    }
}
