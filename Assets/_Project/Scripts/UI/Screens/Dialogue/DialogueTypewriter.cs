using System;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Reveals a subtitle page character by character at the text speed (GDD 02 12.7: "Ein Tastendruck zeigt die Zeile sofort
    /// ganz, der zweite geht weiter"). Pure logic; line breaks count as characters.
    /// </summary>
    public sealed class DialogueTypewriter
    {
        private string _text = string.Empty;
        private float _visible;

        /// <summary>Text of the page.</summary>
        public string Text => _text;

        /// <summary>Number of visible characters.</summary>
        public int VisibleCount => Math.Min(_text.Length, (int)_visible);

        /// <summary>True if the whole page is visible.</summary>
        public bool IsComplete => VisibleCount >= _text.Length;

        /// <summary>The visible part of the page.</summary>
        public string VisibleText => IsComplete ? _text : _text.Substring(0, VisibleCount);

        /// <summary>Starts a new page with no visible character.</summary>
        /// <param name="text">Page text.</param>
        public void Start(string text)
        {
            _text = text ?? string.Empty;
            _visible = 0f;
        }

        /// <summary>Reveals characters for one frame.</summary>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <param name="charactersPerSecond">Speed; infinity shows the page at once.</param>
        /// <returns>True if more characters became visible.</returns>
        public bool Tick(float deltaTime, float charactersPerSecond)
        {
            if (IsComplete)
            {
                return false;
            }

            int before = VisibleCount;
            if (float.IsInfinity(charactersPerSecond) || charactersPerSecond <= 0f)
            {
                _visible = _text.Length;
            }
            else
            {
                float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
                _visible = Math.Min(_text.Length, _visible + dt * charactersPerSecond);
            }

            return VisibleCount != before;
        }

        /// <summary>Shows the whole page at once.</summary>
        /// <returns>True if something changed.</returns>
        public bool Complete()
        {
            if (IsComplete)
            {
                return false;
            }

            _visible = _text.Length;
            return true;
        }
    }
}
