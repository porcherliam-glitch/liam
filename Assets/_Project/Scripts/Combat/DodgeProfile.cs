namespace Aetherfall.Combat
{
    /// <summary>
    /// Timing of a dodge roll or back step (GDD 03 3.2, times from the button press). Immutable value type; the presets are
    /// the GDD values per armor class.
    /// </summary>
    public readonly struct DodgeProfile
    {
        /// <summary>Distance in metres.</summary>
        public readonly float Distance;

        /// <summary>Total duration in seconds.</summary>
        public readonly float Duration;

        /// <summary>Start of the invulnerability window (i-frames) in seconds.</summary>
        public readonly float IFrameStart;

        /// <summary>End of the invulnerability window in seconds.</summary>
        public readonly float IFrameEnd;

        /// <summary>From here an attack, block or another dodge may end the dodge ("abbrechbar ab").</summary>
        public readonly float CancelFrom;

        /// <summary>Stamina cost.</summary>
        public readonly float StaminaCost;

        /// <summary>Creates a profile.</summary>
        /// <param name="distance">Distance.</param>
        /// <param name="duration">Duration.</param>
        /// <param name="iFrameStart">Start of the i-frames.</param>
        /// <param name="iFrameEnd">End of the i-frames.</param>
        /// <param name="cancelFrom">Cancel point.</param>
        /// <param name="staminaCost">Stamina cost.</param>
        public DodgeProfile(float distance, float duration, float iFrameStart, float iFrameEnd, float cancelFrom, float staminaCost)
        {
            Distance = distance;
            Duration = duration;
            IFrameStart = iFrameStart;
            IFrameEnd = iFrameEnd;
            CancelFrom = cancelFrom;
            StaminaCost = staminaCost;
        }

        /// <summary>Light armor (GDD 03 3.2): 4.2 m, 550 ms, i-frames 50–350 ms, cancel from 400 ms, 12 stamina.</summary>
        public static DodgeProfile Light => new DodgeProfile(4.2f, 0.55f, 0.05f, 0.35f, 0.40f, 12f);

        /// <summary>Medium armor (GDD 03 3.2): 3.6 m, 650 ms, i-frames 50–300 ms, cancel from 480 ms, 15 stamina.</summary>
        public static DodgeProfile Medium => new DodgeProfile(3.6f, 0.65f, 0.05f, 0.30f, 0.48f, 15f);

        /// <summary>Heavy armor (GDD 03 3.2): 3.0 m, 800 ms, i-frames 60–260 ms, cancel from 600 ms, 20 stamina.</summary>
        public static DodgeProfile Heavy => new DodgeProfile(3.0f, 0.80f, 0.06f, 0.26f, 0.60f, 20f);

        /// <summary>Back step without direction (GDD 03 3.2): 2.0 m, 350 ms, i-frames 50–200 ms, cancel from 250 ms, 8 stamina.</summary>
        public static DodgeProfile BackStep => new DodgeProfile(2.0f, 0.35f, 0.05f, 0.20f, 0.25f, 8f);

        /// <summary>Speed while dodging (distance / duration).</summary>
        public float Speed => Duration > 0f ? Distance / Duration : 0f;

        /// <summary>True if <paramref name="elapsed"/> lies in the i-frame window.</summary>
        /// <param name="elapsed">Seconds since the dodge started.</param>
        public bool IsInvulnerableAt(float elapsed)
        {
            return elapsed >= IFrameStart && elapsed < IFrameEnd;
        }
    }
}
