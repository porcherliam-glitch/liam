using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Height of the black cinema bars of a cutscene (S58): the picture is cut to 2.35:1, but each bar covers at most 13 % of the
    /// screen; wide screens (21:9, 32:9) get no bars. Pure logic.
    /// </summary>
    public static class LetterboxMath
    {
        /// <summary>Aspect ratio the bars cut the picture to.</summary>
        public const float TargetAspect = 2.35f;

        /// <summary>Largest share of the screen height per bar.</summary>
        public const float MaxBarFraction = 0.13f;

        /// <summary>Bars thinner than this share are left out.</summary>
        public const float MinBarFraction = 0.01f;

        /// <summary>Share of the screen height covered by each of the two bars.</summary>
        /// <param name="aspect">Screen width divided by height.</param>
        public static float BarFraction(float aspect)
        {
            if (!(aspect > 0f) || float.IsInfinity(aspect))
            {
                return 0f;
            }

            float fraction = Math.Min(MaxBarFraction, Math.Max(0f, (1f - aspect / TargetAspect) / 2f));
            return fraction < MinBarFraction ? 0f : fraction;
        }
    }
}
