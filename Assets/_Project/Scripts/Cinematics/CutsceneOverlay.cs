namespace Aetherfall.Cinematics
{
    /// <summary>Colour of the full-screen veil of a cutscene.</summary>
    public enum CutsceneFadeColor
    {
        /// <summary>Black (title cards, cuts).</summary>
        Black = 0,

        /// <summary>White (flash of the rift).</summary>
        White = 1
    }

    /// <summary>
    /// What the cutscene screen shows over the picture at one moment (S58): a subtitle with its speaker, a caption card in the
    /// middle and the veil (black or white, 0 = invisible).
    /// </summary>
    public readonly struct CutsceneOverlay
    {
        /// <summary>Nothing over the picture.</summary>
        public static readonly CutsceneOverlay Empty = new CutsceneOverlay(string.Empty, string.Empty, string.Empty, 0f, CutsceneFadeColor.Black);

        /// <summary>A black screen (start of a cutscene, skipping).</summary>
        public static readonly CutsceneOverlay Black = new CutsceneOverlay(string.Empty, string.Empty, string.Empty, 1f, CutsceneFadeColor.Black);

        /// <summary>Creates an overlay.</summary>
        /// <param name="speaker">Speaker of the subtitle (empty: none or a narrator).</param>
        /// <param name="text">Subtitle text (empty: none).</param>
        /// <param name="caption">Caption card text (empty: none).</param>
        /// <param name="fadeAlpha">Veil 0 (invisible) … 1 (full).</param>
        /// <param name="fadeColor">Veil colour.</param>
        public CutsceneOverlay(string speaker, string text, string caption, float fadeAlpha, CutsceneFadeColor fadeColor)
        {
            Speaker = speaker ?? string.Empty;
            Text = text ?? string.Empty;
            Caption = caption ?? string.Empty;
            FadeAlpha = fadeAlpha < 0f ? 0f : fadeAlpha > 1f ? 1f : fadeAlpha;
            FadeColor = fadeColor;
        }

        /// <summary>Speaker of the subtitle.</summary>
        public string Speaker { get; }

        /// <summary>Subtitle text.</summary>
        public string Text { get; }

        /// <summary>Caption card text.</summary>
        public string Caption { get; }

        /// <summary>Veil 0 … 1.</summary>
        public float FadeAlpha { get; }

        /// <summary>Veil colour.</summary>
        public CutsceneFadeColor FadeColor { get; }

        /// <summary>True if the overlay shows the same as another one.</summary>
        /// <param name="other">Other overlay.</param>
        public bool SameAs(in CutsceneOverlay other)
        {
            return Speaker == other.Speaker && Text == other.Text && Caption == other.Caption && FadeColor == other.FadeColor &&
                   System.Math.Abs(FadeAlpha - other.FadeAlpha) < 0.001f;
        }
    }
}
