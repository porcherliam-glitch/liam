using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Runs one <see cref="AttackSpec"/> along its time line and opens/closes the hit window at the right times through
    /// <see cref="IHitWindowReceiver"/> (the API Animation Events will call later, §9.8). Used by the player combat state
    /// machine and by enemies. Pure logic; time is local combat time (hitstop passes 0).
    /// </summary>
    public sealed class AttackRunner
    {
        private IHitWindowReceiver _receiver;
        private bool _windowOpen;
        private bool _passedActive;

        /// <summary>Creates the runner.</summary>
        /// <param name="receiver">Receiver of the hit window (hitbox); null = no hit registration (tests).</param>
        public AttackRunner(IHitWindowReceiver receiver = null)
        {
            _receiver = receiver;
        }

        /// <summary>The running attack, or null.</summary>
        public AttackSpec Current { get; private set; }

        /// <summary>Seconds since the running attack started.</summary>
        public float Elapsed { get; private set; }

        /// <summary>Phase of the running attack.</summary>
        public AttackPhase Phase => Current != null ? Current.PhaseAt(Elapsed) : AttackPhase.None;

        /// <summary>True while an attack runs.</summary>
        public bool IsRunning => Current != null;

        /// <summary>True while the hit window is open.</summary>
        public bool IsHitWindowOpen => _windowOpen;

        /// <summary>Progress of the running attack, 0–1.</summary>
        public float Progress => Current != null && Current.TotalSeconds > 0f ? Math.Min(1f, Elapsed / Current.TotalSeconds) : 0f;

        /// <summary>Raised when an attack finished regularly (not when cancelled).</summary>
        public event Action<AttackSpec> Finished;

        /// <summary>Replaces the receiver (e.g. after the hitbox was created).</summary>
        /// <param name="receiver">New receiver or null.</param>
        public void SetReceiver(IHitWindowReceiver receiver)
        {
            CloseWindow();
            _receiver = receiver;
        }

        /// <summary>Starts an attack; a running one is cancelled first.</summary>
        /// <param name="attack">Attack to run.</param>
        public void Start(AttackSpec attack)
        {
            if (attack == null)
            {
                throw new ArgumentNullException(nameof(attack));
            }

            Cancel();
            Current = attack;
            Elapsed = 0f;
            UpdateWindow();
        }

        /// <summary>Advances the attack.</summary>
        /// <param name="deltaTime">Local combat time in seconds.</param>
        /// <returns>True while the attack is still running after this step.</returns>
        public bool Tick(float deltaTime)
        {
            if (Current == null)
            {
                return false;
            }

            if (deltaTime > 0f)
            {
                Elapsed += deltaTime;
            }

            // A long frame may jump over the whole active phase: open the window once so the hitbox gets one query.
            AttackSpec attack = Current;
            if (!_windowOpen && Elapsed >= attack.ActiveEndSeconds && !_passedActive)
            {
                OpenWindow();
            }

            UpdateWindow();
            if (Elapsed >= attack.TotalSeconds)
            {
                CloseWindow();
                Current = null;
                Elapsed = 0f;
                _passedActive = false;
                Action<AttackSpec> finished = Finished;
                if (finished != null)
                {
                    finished(attack);
                }

                return false;
            }

            return true;
        }

        /// <summary>Stops the running attack without finishing it (dodge cancel, stagger, death).</summary>
        public void Cancel()
        {
            CloseWindow();
            Current = null;
            Elapsed = 0f;
            _passedActive = false;
        }

        private void UpdateWindow()
        {
            if (Current == null)
            {
                CloseWindow();
                return;
            }

            bool shouldBeOpen = Current.PhaseAt(Elapsed) == AttackPhase.Active;
            if (shouldBeOpen && !_windowOpen && !_passedActive)
            {
                OpenWindow();
            }
            else if (!shouldBeOpen && _windowOpen)
            {
                CloseWindow();
            }
        }

        private void OpenWindow()
        {
            _windowOpen = true;
            _passedActive = true;
            if (_receiver != null)
            {
                _receiver.OpenHitWindow(Current);
            }
        }

        private void CloseWindow()
        {
            if (!_windowOpen)
            {
                return;
            }

            _windowOpen = false;
            if (_receiver != null)
            {
                _receiver.CloseHitWindow();
            }
        }
    }
}
