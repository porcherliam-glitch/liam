using System;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Subtitle options of the dialogue screen (GDD 05 4.2): text speed (default fast), automatic continue (default off) with
    /// reading factor 1-3. Kept for the session until the options step stores them (TODO options step: part of the settings
    /// file and the options page).
    /// </summary>
    public sealed class DialogueScreenPreferences
    {
        /// <summary>Characters per second of <see cref="DialogueTextSpeed.Slow"/>.</summary>
        public const float SlowCharactersPerSecond = 20f;

        /// <summary>Characters per second of <see cref="DialogueTextSpeed.Normal"/>.</summary>
        public const float NormalCharactersPerSecond = 40f;

        /// <summary>Characters per second of <see cref="DialogueTextSpeed.Fast"/>.</summary>
        public const float FastCharactersPerSecond = 80f;

        private float _readingFactor = 1f;

        /// <summary>Raised after a change.</summary>
        public event Action Changed;

        /// <summary>Text speed (default fast).</summary>
        public DialogueTextSpeed TextSpeed { get; private set; } = DialogueTextSpeed.Fast;

        /// <summary>True: lines continue on their own after their display duration.</summary>
        public bool AutoContinue { get; private set; }

        /// <summary>Reading factor 1-3 for the automatic continue.</summary>
        public float ReadingFactor => _readingFactor;

        /// <summary>Characters per second of a speed; infinity for <see cref="DialogueTextSpeed.Instant"/>.</summary>
        /// <param name="speed">Speed.</param>
        public static float CharactersPerSecond(DialogueTextSpeed speed)
        {
            switch (speed)
            {
                case DialogueTextSpeed.Slow: return SlowCharactersPerSecond;
                case DialogueTextSpeed.Normal: return NormalCharactersPerSecond;
                case DialogueTextSpeed.Instant: return float.PositiveInfinity;
                default: return FastCharactersPerSecond;
            }
        }

        /// <summary>Sets the text speed.</summary>
        /// <param name="speed">Speed.</param>
        public void SetTextSpeed(DialogueTextSpeed speed)
        {
            if (TextSpeed != speed)
            {
                TextSpeed = speed;
                Changed?.Invoke();
            }
        }

        /// <summary>Switches the automatic continue on or off and sets the reading factor (clamped to 1-3).</summary>
        /// <param name="enabled">True = continue on its own.</param>
        /// <param name="readingFactor">Reading factor.</param>
        public void SetAutoContinue(bool enabled, float readingFactor = 1f)
        {
            float factor = float.IsNaN(readingFactor) ? 1f : Math.Max(1f, Math.Min(3f, readingFactor));
            if (AutoContinue != enabled || Math.Abs(_readingFactor - factor) > 0.0001f)
            {
                AutoContinue = enabled;
                _readingFactor = factor;
                Changed?.Invoke();
            }
        }
    }
}
