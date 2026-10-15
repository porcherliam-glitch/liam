namespace Aetherfall.Core
{
    /// <summary>
    /// Rules of the detective mode (GDD 02 5.1, GDD 03 skill table "Untersuchen → Aether-Sicht"): hold the Investigate button;
    /// normal investigating lights up clues and trail marks within 5 m, Aether sight (learned in HQ 4) within 40 m, also Aether
    /// trails and hidden paths, and limits the movement to walking. No costs.
    /// </summary>
    public static class InvestigateRules
    {
        /// <summary>Radius of normal investigating in metres.</summary>
        public const float InvestigateRadius = 5f;

        /// <summary>Radius of Aether sight in metres.</summary>
        public const float AetherSightRadius = 40f;

        /// <summary>
        /// Seconds the button must be held before investigating starts (R3 is shared with lock-on: a short press toggles the
        /// lock-on and must not light clues up).
        /// </summary>
        public const float HoldDelaySeconds = 0.2f;

        /// <summary>World flag of Aether sight (set by HQ 4 "Der Steinkreis von Altenhain").</summary>
        public const string AetherSightFlag = "flag.faehigkeit.aether_sicht";

        /// <summary>Radius of the current mode.</summary>
        /// <param name="aetherSight">True in Aether sight.</param>
        public static float Radius(bool aetherSight)
        {
            return aetherSight ? AetherSightRadius : InvestigateRadius;
        }

        /// <summary>True if the mode shows something of <paramref name="kind"/> at <paramref name="distance"/> metres.</summary>
        /// <param name="kind">What it is.</param>
        /// <param name="aetherSight">True in Aether sight.</param>
        /// <param name="distance">Distance from the player in metres.</param>
        public static bool Reveals(InvestigateKind kind, bool aetherSight, float distance)
        {
            if (kind == InvestigateKind.AetherOnly && !aetherSight)
            {
                // GDD 05 3.2: hidden paths and platforms appear only while Aether sight is active.
                return false;
            }

            return distance <= Radius(aetherSight);
        }

        /// <summary>
        /// True if the hold of the button means investigating: not while a lock-on target is held (R3 is shared with lock-on
        /// on the gamepad, GDD 03 1.4) and only while playing.
        /// </summary>
        /// <param name="held">Button held.</param>
        /// <param name="lockedOn">A lock-on target is held.</param>
        /// <param name="playing">Game state Playing.</param>
        public static bool IsActive(bool held, bool lockedOn, bool playing)
        {
            return held && !lockedOn && playing;
        }
    }
}
