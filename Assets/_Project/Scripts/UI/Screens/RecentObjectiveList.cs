using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Objectives that were just fulfilled stay in the HUD tracker for <see cref="LingerSeconds"/>, ticked off, although the
    /// quest already moved to its next stage or ended in the same frame (pure logic). Without this the check mark of the
    /// last objective of a stage would never be seen.
    /// </summary>
    public sealed class RecentObjectiveList
    {
        /// <summary>How long a fulfilled objective stays visible after its stage ended (s).</summary>
        public const float LingerSeconds = 1.5f;

        private readonly List<string> _questIds = new List<string>();
        private readonly List<QuestObjectiveLine> _lines = new List<QuestObjectiveLine>();
        private readonly List<float> _remaining = new List<float>();

        /// <summary>Number of lingering objectives.</summary>
        public int Count => _lines.Count;

        /// <summary>Adds a fulfilled objective (an older entry with the same key is replaced).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="line">Objective line (should be done).</param>
        public void Add(string questId, in QuestObjectiveLine line)
        {
            string id = questId ?? string.Empty;
            for (int i = 0; i < _lines.Count; i++)
            {
                if (_questIds[i] == id && _lines[i].Key == line.Key)
                {
                    _lines[i] = line;
                    _remaining[i] = LingerSeconds;
                    return;
                }
            }

            _questIds.Add(id);
            _lines.Add(line);
            _remaining.Add(LingerSeconds);
        }

        /// <summary>Counts down and drops expired objectives.</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <returns>True if one was dropped.</returns>
        public bool Tick(float deltaTime)
        {
            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            bool dropped = false;
            for (int i = _lines.Count - 1; i >= 0; i--)
            {
                _remaining[i] -= dt;
                if (_remaining[i] <= 0f)
                {
                    _questIds.RemoveAt(i);
                    _lines.RemoveAt(i);
                    _remaining.RemoveAt(i);
                    dropped = true;
                }
            }

            return dropped;
        }

        /// <summary>Puts the lingering objectives of a quest that are missing in <paramref name="lines"/> in front of them.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="lines">Current objective lines of the quest.</param>
        /// <returns>Number of inserted lines.</returns>
        public int InsertMissing(string questId, List<QuestObjectiveLine> lines)
        {
            if (lines == null)
            {
                throw new ArgumentNullException(nameof(lines));
            }

            int inserted = 0;
            for (int i = 0; i < _lines.Count; i++)
            {
                if (_questIds[i] != questId || Contains(lines, _lines[i].Key))
                {
                    continue;
                }

                lines.Insert(inserted, _lines[i]);
                inserted++;
            }

            return inserted;
        }

        /// <summary>Quest ids with lingering objectives, in order of their first entry.</summary>
        /// <param name="results">Cleared and filled.</param>
        public void CollectQuestIds(List<string> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            for (int i = 0; i < _questIds.Count; i++)
            {
                if (!results.Contains(_questIds[i]))
                {
                    results.Add(_questIds[i]);
                }
            }
        }

        /// <summary>Drops everything (new or loaded game).</summary>
        public void Clear()
        {
            _questIds.Clear();
            _lines.Clear();
            _remaining.Clear();
        }

        private static bool Contains(List<QuestObjectiveLine> lines, string key)
        {
            for (int i = 0; i < lines.Count; i++)
            {
                if (lines[i].Key == key)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
