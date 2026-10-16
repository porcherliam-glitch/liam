namespace Aetherfall.Cinematics
{
    /// <summary>What a camera is for, as far as the blends between cameras care.</summary>
    public enum CinematicCameraRole
    {
        /// <summary>A game camera (exploring, lock-on, aiming) or none.</summary>
        Gameplay = 0,

        /// <summary>One of the dialogue cameras.</summary>
        Dialogue = 1
    }

    /// <summary>How the brain changes from one camera to the next.</summary>
    public enum CinematicBlendKind
    {
        /// <summary>The brain's default blend (0.25 s).</summary>
        Default = 0,

        /// <summary>A hard cut.</summary>
        Cut = 1,

        /// <summary>A soft ease in and out over <see cref="CinematicBlend.Seconds"/>.</summary>
        Ease = 2
    }

    /// <summary>A blend decision.</summary>
    public readonly struct CinematicBlend
    {
        /// <summary>Creates a decision.</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="seconds">Length of an ease.</param>
        public CinematicBlend(CinematicBlendKind kind, float seconds)
        {
            Kind = kind;
            Seconds = seconds;
        }

        /// <summary>Kind.</summary>
        public CinematicBlendKind Kind { get; }

        /// <summary>Length of an ease in seconds.</summary>
        public float Seconds { get; }
    }

    /// <summary>
    /// Blends around the dialogue camera (GDD 03 "Dialogkamera"): into and out of a conversation a soft 0.4 s ease, between the
    /// dialogue cameras hard cuts, everything else the brain's default. Pure logic.
    /// </summary>
    public static class CinematicBlendRules
    {
        /// <summary>The blend from one camera to another.</summary>
        /// <param name="from">Role of the camera that was live.</param>
        /// <param name="to">Role of the camera that becomes live.</param>
        public static CinematicBlend Choose(CinematicCameraRole from, CinematicCameraRole to)
        {
            if (from == CinematicCameraRole.Dialogue && to == CinematicCameraRole.Dialogue)
            {
                return new CinematicBlend(CinematicBlendKind.Cut, 0f);
            }

            if (from == CinematicCameraRole.Dialogue || to == CinematicCameraRole.Dialogue)
            {
                return new CinematicBlend(CinematicBlendKind.Ease, DialogueCameraRules.EntryBlendSeconds);
            }

            return new CinematicBlend(CinematicBlendKind.Default, 0f);
        }
    }
}
