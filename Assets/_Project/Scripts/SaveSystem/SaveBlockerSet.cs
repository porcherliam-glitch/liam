using System;
using System.Collections.Generic;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Active save locks (architecture 9.8: <c>AddBlocker(id, reasonKey)</c>): ordered by the time they were added, so the
    /// oldest lock is the reason shown to the player. Pure logic.
    /// </summary>
    public sealed class SaveBlockerSet
    {
        private readonly List<string> _ids = new List<string>();
        private readonly List<string> _reasons = new List<string>();

        /// <summary>Number of active locks.</summary>
        public int Count => _ids.Count;

        /// <summary>Adds a lock, or updates the reason of an existing one (keeping its position).</summary>
        /// <param name="blockerId">Lock id.</param>
        /// <param name="reasonKey">Localization key of the reason.</param>
        public void Add(string blockerId, string reasonKey)
        {
            if (string.IsNullOrEmpty(blockerId))
            {
                throw new ArgumentException("A blocker id is required.", nameof(blockerId));
            }

            int index = _ids.IndexOf(blockerId);
            if (index >= 0)
            {
                _reasons[index] = reasonKey ?? string.Empty;
                return;
            }

            _ids.Add(blockerId);
            _reasons.Add(reasonKey ?? string.Empty);
        }

        /// <summary>Removes a lock.</summary>
        /// <param name="blockerId">Lock id.</param>
        /// <returns>True if it was active.</returns>
        public bool Remove(string blockerId)
        {
            int index = _ids.IndexOf(blockerId);
            if (index < 0)
            {
                return false;
            }

            _ids.RemoveAt(index);
            _reasons.RemoveAt(index);
            return true;
        }

        /// <summary>True if the lock is active.</summary>
        /// <param name="blockerId">Lock id.</param>
        public bool Contains(string blockerId)
        {
            return _ids.Contains(blockerId);
        }

        /// <summary>Reason of the oldest active lock.</summary>
        /// <param name="reasonKey">Reason key, or empty if there is no lock.</param>
        /// <returns>True if at least one lock is active.</returns>
        public bool TryGetFirstReason(out string reasonKey)
        {
            if (_ids.Count == 0)
            {
                reasonKey = string.Empty;
                return false;
            }

            reasonKey = _reasons[0];
            return true;
        }

        /// <summary>Removes all locks (new session).</summary>
        public void Clear()
        {
            _ids.Clear();
            _reasons.Clear();
        }
    }
}
