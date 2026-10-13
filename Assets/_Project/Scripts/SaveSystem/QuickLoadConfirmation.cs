namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Safety question of quick load (GDD 05 5.4: "Schnellspeicherung von vor 4 min laden? … Ein zweiter Druck auf F9
    /// oder Enter bestaetigt"): the first press only asks, a second press within the window confirms. Pure logic; the
    /// caller passes the real time.
    /// </summary>
    public sealed class QuickLoadConfirmation
    {
        /// <summary>Default window for the confirming press in seconds.</summary>
        public const float DefaultWindowSeconds = 3f;

        private float _pendingSince = float.NegativeInfinity;

        /// <summary>Creates the confirmation.</summary>
        /// <param name="windowSeconds">Time for the second press.</param>
        public QuickLoadConfirmation(float windowSeconds = DefaultWindowSeconds)
        {
            WindowSeconds = windowSeconds;
        }

        /// <summary>Time for the second press in seconds.</summary>
        public float WindowSeconds { get; }

        /// <summary>True while the question is open.</summary>
        /// <param name="now">Current real time in seconds.</param>
        public bool IsPending(float now)
        {
            return now - _pendingSince <= WindowSeconds;
        }

        /// <summary>Handles a press of the quick load button.</summary>
        /// <param name="now">Current real time in seconds.</param>
        /// <returns>True if this press confirms the load; false if it only opened the question.</returns>
        public bool Press(float now)
        {
            if (IsPending(now))
            {
                Cancel();
                return true;
            }

            _pendingSince = now;
            return false;
        }

        /// <summary>Closes the question without loading.</summary>
        public void Cancel()
        {
            _pendingSince = float.NegativeInfinity;
        }
    }
}
