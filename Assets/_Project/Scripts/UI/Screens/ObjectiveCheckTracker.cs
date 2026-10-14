using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Remembers which objectives were already shown as done, so an objective that gets done while it is shown flashes once
    /// (<see cref="FlashSeconds"/>, USS class <c>is-just-done</c>) while its check mark pops in. Pure logic.
    /// </summary>
    /// <remarks>
    /// Objectives seen for the first time count as known without a flash (opening the journal or loading a game shows done
    /// objectives quietly). Keys are <c>questId/stage.objective</c>.
    /// </remarks>
    public sealed class ObjectiveCheckTracker
    {
        /// <summary>How long a ticked-off objective is highlighted (s).</summary>
        public const float FlashSeconds = 0.6f;

        private readonly Dictionary<string, bool> _done = new Dictionary<string, bool>(StringComparer.Ordinal);
        private readonly Dictionary<string, float> _flash = new Dictionary<string, float>(StringComparer.Ordinal);
        private readonly List<string> _expired = new List<string>();
        private readonly List<string> _keys = new List<string>();

        /// <summary>Number of objectives that are flashing now.</summary>
        public int FlashingCount => _flash.Count;

        /// <summary>Builds the key of an objective.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveKey">Stage-qualified objective id.</param>
        public static string KeyOf(string questId, string objectiveKey)
        {
            return (questId ?? string.Empty) + "/" + (objectiveKey ?? string.Empty);
        }

        /// <summary>Reports the shown state of an objective.</summary>
        /// <param name="key">Key (<see cref="KeyOf"/>).</param>
        /// <param name="done">True if done.</param>
        /// <returns>True if it just became done (it was shown as open before).</returns>
        public bool Observe(string key, bool done)
        {
            if (string.IsNullOrEmpty(key))
            {
                return false;
            }

            bool known = _done.TryGetValue(key, out bool wasDone);
            _done[key] = done;
            if (known && !wasDone && done)
            {
                _flash[key] = FlashSeconds;
                return true;
            }

            if (!done)
            {
                _flash.Remove(key);
            }

            return false;
        }

        /// <summary>True while the objective is highlighted.</summary>
        /// <param name="key">Key.</param>
        public bool IsFlashing(string key)
        {
            return key != null && _flash.ContainsKey(key);
        }

        /// <summary>Counts the highlights down.</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <returns>True if a highlight ended (the view updates its classes).</returns>
        public bool Tick(float deltaTime)
        {
            if (_flash.Count == 0)
            {
                return false;
            }

            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            _expired.Clear();
            _keys.Clear();
            _keys.AddRange(_flash.Keys);
            for (int i = 0; i < _keys.Count; i++)
            {
                float remaining = _flash[_keys[i]] - dt;
                if (remaining <= 0f)
                {
                    _expired.Add(_keys[i]);
                }
                else
                {
                    _flash[_keys[i]] = remaining;
                }
            }

            for (int i = 0; i < _expired.Count; i++)
            {
                _flash.Remove(_expired[i]);
            }

            return _expired.Count > 0;
        }

        /// <summary>Forgets everything (new or loaded game): the next states are shown without a flash.</summary>
        public void Forget()
        {
            _done.Clear();
            _flash.Clear();
        }
    }
}
