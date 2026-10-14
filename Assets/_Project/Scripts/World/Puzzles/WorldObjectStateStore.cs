using System;
using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Default <see cref="IWorldObjectStateStore"/>: a dictionary of non-zero states. Pure logic; the service variant with
    /// event subscriptions is <see cref="WorldObjectStateService"/>. Also the local fallback of components when no installer
    /// registered the service (then nothing is saved and objects do not see each other's states).
    /// </summary>
    public class WorldObjectStateStore : IWorldObjectStateStore
    {
        private readonly Dictionary<string, int> _states = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <inheritdoc />
        public int Count => _states.Count;

        /// <inheritdoc />
        public event Action<string> StateChanged;

        /// <inheritdoc />
        public event Action StatesReplaced;

        /// <inheritdoc />
        public int GetState(string id)
        {
            return !string.IsNullOrEmpty(id) && _states.TryGetValue(id, out int state) ? state : WorldObjectStates.Initial;
        }

        /// <inheritdoc />
        public bool TryGetState(string id, out int state)
        {
            state = WorldObjectStates.Initial;
            return !string.IsNullOrEmpty(id) && _states.TryGetValue(id, out state);
        }

        /// <inheritdoc />
        public bool SetState(string id, int state)
        {
            if (string.IsNullOrEmpty(id))
            {
                throw new ArgumentException("An object id is required.", nameof(id));
            }

            int old = GetState(id);
            if (old == state)
            {
                return false;
            }

            if (state == WorldObjectStates.Initial)
            {
                _states.Remove(id);
            }
            else
            {
                _states[id] = state;
            }

            Action<string> changed = StateChanged;
            if (changed != null)
            {
                changed(id);
            }

            return true;
        }

        /// <inheritdoc />
        public Dictionary<string, int> Snapshot()
        {
            return new Dictionary<string, int>(_states, StringComparer.Ordinal);
        }

        /// <inheritdoc />
        public void Restore(IReadOnlyDictionary<string, int> states)
        {
            _states.Clear();
            if (states != null)
            {
                foreach (KeyValuePair<string, int> pair in states)
                {
                    if (!string.IsNullOrEmpty(pair.Key) && pair.Value != WorldObjectStates.Initial)
                    {
                        _states[pair.Key] = pair.Value;
                    }
                }
            }

            Action replaced = StatesReplaced;
            if (replaced != null)
            {
                replaced();
            }
        }
    }
}
