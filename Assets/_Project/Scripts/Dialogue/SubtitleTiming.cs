using System;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Display duration of a subtitle line (GDD 02, 12.7 "Automatisch fortsetzen"): <c>max(2.0 s; 1.0 s + 0.06 s per
    /// character) × reading factor</c>; with voice output the clip length plus 0.5 s (12.8: a missing clip falls back to the
    /// text timing). Pure logic.
    /// </summary>
    public static class SubtitleTiming
    {
        /// <summary>Shortest display duration in seconds.</summary>
        public const float MinSeconds = 2f;

        /// <summary>Base duration in seconds.</summary>
        public const float BaseSeconds = 1f;

        /// <summary>Additional seconds per character.</summary>
        public const float SecondsPerCharacter = 0.06f;

        /// <summary>Pause after a voice clip in seconds.</summary>
        public const float AfterClipSeconds = 0.5f;

        /// <summary>Smallest reading factor (option 1-3×, GDD 05 4.2).</summary>
        public const float MinReadingFactor = 1f;

        /// <summary>Largest reading factor.</summary>
        public const float MaxReadingFactor = 3f;

        /// <summary>Display duration in seconds.</summary>
        /// <param name="characters">Number of characters of the shown text.</param>
        /// <param name="readingFactor">Reading factor 1-3 (clamped).</param>
        /// <param name="clipSeconds">Length of the voice clip; 0 or less = no clip (text timing).</param>
        public static float DisplaySeconds(int characters, float readingFactor = 1f, float clipSeconds = 0f)
        {
            if (clipSeconds > 0f)
            {
                return clipSeconds + AfterClipSeconds;
            }

            float factor = Math.Max(MinReadingFactor, Math.Min(MaxReadingFactor, float.IsNaN(readingFactor) ? 1f : readingFactor));
            float seconds = Math.Max(MinSeconds, BaseSeconds + SecondsPerCharacter * Math.Max(0, characters));
            return seconds * factor;
        }
    }
}
