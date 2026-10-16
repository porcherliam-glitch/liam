using System;
using UnityEngine;

namespace Aetherfall.Cinematics
{
    /// <summary>What a cue of a cutscene shows.</summary>
    public enum CutsceneCueKind
    {
        /// <summary>A subtitle with an optional speaker, bottom centre.</summary>
        Subtitle = 0,

        /// <summary>A caption card in the middle ("Eichental, am Tag des Erntefests.").</summary>
        Caption = 1,

        /// <summary>The full-screen veil (black or white).</summary>
        Fade = 2
    }

    /// <summary>
    /// One timed entry over the picture of a cutscene (S58): a subtitle, a caption card or the veil, from <see cref="Start"/> to
    /// <see cref="End"/> seconds. The veil rises over <see cref="FadeIn"/> and falls over <see cref="FadeOut"/>. Written by the
    /// generator from the cutscene script and stored on the scene's player.
    /// </summary>
    [Serializable]
    public sealed class CutsceneCue
    {
        [Tooltip("Art: Untertitel, Texttafel oder Abblende.")]
        [SerializeField] private CutsceneCueKind kind = CutsceneCueKind.Subtitle;

        [Tooltip("Beginn in Sekunden.")]
        [Min(0f)] [SerializeField] private float start;

        [Tooltip("Ende in Sekunden.")]
        [Min(0f)] [SerializeField] private float end;

        [Tooltip("Sprecher des Untertitels (leer: Erzähler).")]
        [SerializeField] private string speaker = string.Empty;

        [Tooltip("Text des Untertitels oder der Texttafel.")]
        [SerializeField] private string text = string.Empty;

        [Tooltip("Sekunden, in denen die Abblende aufsteigt.")]
        [Min(0f)] [SerializeField] private float fadeIn;

        [Tooltip("Sekunden, in denen die Abblende vergeht.")]
        [Min(0f)] [SerializeField] private float fadeOut;

        [Tooltip("Farbe der Abblende.")]
        [SerializeField] private CutsceneFadeColor color = CutsceneFadeColor.Black;

        /// <summary>Creates an empty cue (serialization).</summary>
        public CutsceneCue()
        {
        }

        /// <summary>Creates a cue.</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="start">Start in seconds.</param>
        /// <param name="end">End in seconds.</param>
        /// <param name="speaker">Speaker (subtitle).</param>
        /// <param name="text">Text (subtitle, caption).</param>
        /// <param name="fadeIn">Veil ramp up in seconds.</param>
        /// <param name="fadeOut">Veil ramp down in seconds.</param>
        /// <param name="color">Veil colour.</param>
        public CutsceneCue(CutsceneCueKind kind, float start, float end, string speaker = "", string text = "", float fadeIn = 0f, float fadeOut = 0f,
            CutsceneFadeColor color = CutsceneFadeColor.Black)
        {
            this.kind = kind;
            this.start = start;
            this.end = end;
            this.speaker = speaker ?? string.Empty;
            this.text = text ?? string.Empty;
            this.fadeIn = fadeIn;
            this.fadeOut = fadeOut;
            this.color = color;
        }

        /// <summary>A subtitle.</summary>
        public static CutsceneCue Subtitle(float start, float end, string speaker, string text)
        {
            return new CutsceneCue(CutsceneCueKind.Subtitle, start, end, speaker, text);
        }

        /// <summary>A caption card.</summary>
        public static CutsceneCue Caption(float start, float end, string text)
        {
            return new CutsceneCue(CutsceneCueKind.Caption, start, end, string.Empty, text);
        }

        /// <summary>The veil.</summary>
        public static CutsceneCue Fade(float start, float end, float fadeIn, float fadeOut, CutsceneFadeColor color)
        {
            return new CutsceneCue(CutsceneCueKind.Fade, start, end, string.Empty, string.Empty, fadeIn, fadeOut, color);
        }

        /// <summary>Kind.</summary>
        public CutsceneCueKind Kind => kind;

        /// <summary>Start in seconds.</summary>
        public float Start => start;

        /// <summary>End in seconds.</summary>
        public float End => end;

        /// <summary>Speaker.</summary>
        public string Speaker => speaker ?? string.Empty;

        /// <summary>Text.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>Veil ramp up.</summary>
        public float FadeIn => fadeIn;

        /// <summary>Veil ramp down.</summary>
        public float FadeOut => fadeOut;

        /// <summary>Veil colour.</summary>
        public CutsceneFadeColor Color => color;
    }
}
