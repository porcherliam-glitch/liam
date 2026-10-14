using System.Collections.Generic;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Records the effects of stand-in actions (<see cref="RecordAction"/>) for systems that do not exist yet: spawning
    /// enemies, experience, NPC relationship. Registered as a service in the quest test environment.
    /// </summary>
    public sealed class ActionLog
    {
        private readonly List<string> _entries = new List<string>();

        /// <summary>Recorded entries in order: <c>&lt;source&gt;: &lt;text&gt;</c>.</summary>
        public IReadOnlyList<string> Entries => _entries;

        /// <summary>Records an entry.</summary>
        /// <param name="sourceId">Running content (quest id).</param>
        /// <param name="text">Effect.</param>
        public void Add(string sourceId, string text)
        {
            _entries.Add(sourceId + ": " + text);
        }

        /// <summary>Number of entries that contain the text.</summary>
        /// <param name="fragment">Text.</param>
        public int CountContaining(string fragment)
        {
            int count = 0;
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Contains(fragment))
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>Forgets all entries.</summary>
        public void Clear()
        {
            _entries.Clear();
        }
    }
}
