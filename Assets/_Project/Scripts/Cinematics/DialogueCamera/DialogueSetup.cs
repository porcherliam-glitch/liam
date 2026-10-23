namespace Aetherfall.Cinematics
{
    /// <summary>Camera setups of the dialogue camera (GDD 02 12.6, GDD 03 "Dialogkamera").</summary>
    public enum DialogueSetup
    {
        /// <summary>Two-shot (German "Halbtotale"): both from the side, at 3.5 m or more.</summary>
        Wide = 0,

        /// <summary>Shot (German "Schuss"): over the player's shoulder onto the partner, 1.4 m.</summary>
        Shot = 1,

        /// <summary>Reverse shot (German "Gegenschuss"): over the partner's shoulder onto the player, 1.4 m.</summary>
        ReverseShot = 2,

        /// <summary>Close-up (German "Nah") of the partner, 0.9 m.</summary>
        Close = 3
    }

    /// <summary>What the camera shows while the player chooses an answer (open question 6: unvoiced protagonist).</summary>
    public enum ChoiceFraming
    {
        /// <summary>Reverse shot onto the player (default).</summary>
        ReverseShot = 0,

        /// <summary>Close-up of the listening partner (GDD 02 12.6 for an unvoiced protagonist).</summary>
        ListeningCloseUp = 1
    }

    /// <summary>Who speaks the current line, seen from the dialogue camera.</summary>
    public enum DialogueSpeaker
    {
        /// <summary>The conversation partner.</summary>
        Partner = 0,

        /// <summary>The player character.</summary>
        Player = 1,

        /// <summary>Somebody else (a companion, a third NPC).</summary>
        Other = 2
    }

    /// <summary>Numbers of the dialogue camera (GDD 02 12.6, GDD 03: 0.9–3.5 m, FOV 32–40°, at least 1.5 s per shot).</summary>
    public static class DialogueCameraRules
    {
        /// <summary>No cut before a shot was on screen this long (seconds).</summary>
        public const double MinShotSeconds = 1.5d;

        /// <summary>Opening two-shot without hint (seconds).</summary>
        public const double OpeningSeconds = 1.5d;

        /// <summary>Opening two-shot with the hint "Eröffnung" (seconds, within 1.5–3).</summary>
        public const double OpeningHintSeconds = 2.5d;

        /// <summary>Blend from the game camera into the dialogue and back (seconds).</summary>
        public const float EntryBlendSeconds = 0.4f;

        /// <summary>After this many lines on one setup the next automatic line goes to the two-shot (GDD 03 "Wechsel alle 1–3 Zeilen").</summary>
        public const int MaxBeatsPerSetup = 3;

        /// <summary>Distance of the close-up from the head.</summary>
        public const double CloseDistance = 0.9d;

        /// <summary>Distance of shot and reverse shot behind the shoulder.</summary>
        public const double OverShoulderDistance = 1.4d;

        /// <summary>Smallest distance of the two-shot from the middle.</summary>
        public const double WideDistance = 3.5d;

        /// <summary>Sideways offset of the over-the-shoulder cameras.</summary>
        public const double ShoulderOffset = 0.75d;

        /// <summary>Head height above the feet.</summary>
        public const double HeadHeight = 1.6d;

        /// <summary>From this distance between the two only the two-shot is used.</summary>
        public const double FarPartnerMeters = 4.0d;

        /// <summary>A partner farther away than this is not the one the player talks to (the game camera stays).</summary>
        public const double MaxPartnerMeters = 8.0d;

        /// <summary>Angle of the close-up off the line between the two (degrees).</summary>
        public const double CloseAngleDegrees = 30d;

        /// <summary>Field of view of the close-up.</summary>
        public const double CloseFieldOfView = 32d;

        /// <summary>Field of view of shot and reverse shot.</summary>
        public const double ShotFieldOfView = 36d;

        /// <summary>Field of view of the two-shot.</summary>
        public const double WideFieldOfView = 40d;

        /// <summary>Priority of the dialogue cameras (above aiming 30, lock-on 20, exploring 0).</summary>
        public const int CameraPriority = 40;
    }
}
