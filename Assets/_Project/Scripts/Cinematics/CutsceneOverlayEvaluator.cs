using System.Collections.Generic;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// What a cutscene shows over the picture at one moment (S58), from its cues: the newest active subtitle and caption card, and
    /// the strongest veil (it rises linearly over its fade-in, falls over its fade-out and is full in between). A cue is active
    /// from its start up to, but not including, its end. Pure logic, run every frame by the scene's player.
    /// </summary>
    public static class CutsceneOverlayEvaluator
    {
        private const float AlphaTolerance = 0.0001f;

        /// <summary>The overlay at a moment.</summary>
        /// <param name="cues">Cues of the cutscene.</param>
        /// <param name="time">Seconds into the cutscene.</param>
        public static CutsceneOverlay Evaluate(IReadOnlyList<CutsceneCue> cues, double time)
        {
            if (cues == null || cues.Count == 0)
            {
                return CutsceneOverlay.Empty;
            }

            CutsceneCue subtitle = null;
            CutsceneCue caption = null;
            float fadeAlpha = 0f;
            float fadeStart = float.MinValue;
            CutsceneFadeColor fadeColor = CutsceneFadeColor.Black;
            for (int i = 0; i < cues.Count; i++)
            {
                CutsceneCue cue = cues[i];
                if (cue == null || time < cue.Start || time >= cue.End)
                {
                    continue;
                }

                switch (cue.Kind)
                {
                    case CutsceneCueKind.Subtitle:
                        if (subtitle == null || cue.Start >= subtitle.Start)
                        {
                            subtitle = cue;
                        }

                        break;
                    case CutsceneCueKind.Caption:
                        if (caption == null || cue.Start >= caption.Start)
                        {
                            caption = cue;
                        }

                        break;
                    case CutsceneCueKind.Fade:
                        float alpha = FadeAlpha(cue, time);
                        if (alpha > fadeAlpha + AlphaTolerance || (alpha > AlphaTolerance && alpha >= fadeAlpha - AlphaTolerance && cue.Start > fadeStart))
                        {
                            fadeAlpha = alpha;
                            fadeStart = cue.Start;
                            fadeColor = cue.Color;
                        }

                        break;
                }
            }

            return new CutsceneOverlay(subtitle?.Speaker ?? string.Empty, subtitle?.Text ?? string.Empty, caption?.Text ?? string.Empty, fadeAlpha,
                fadeColor);
        }

        /// <summary>Strength of one veil cue at a moment (0 outside the cue).</summary>
        /// <param name="cue">Fade cue.</param>
        /// <param name="time">Seconds into the cutscene.</param>
        public static float FadeAlpha(CutsceneCue cue, double time)
        {
            if (cue == null || time < cue.Start || time >= cue.End)
            {
                return 0f;
            }

            double alpha = 1d;
            if (cue.FadeIn > 0f && time < cue.Start + cue.FadeIn)
            {
                alpha = (time - cue.Start) / cue.FadeIn;
            }

            if (cue.FadeOut > 0f && time > cue.End - cue.FadeOut)
            {
                double down = (cue.End - time) / cue.FadeOut;
                if (down < alpha)
                {
                    alpha = down;
                }
            }

            return alpha < 0d ? 0f : alpha > 1d ? 1f : (float)alpha;
        }
    }
}
