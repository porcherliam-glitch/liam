using System.Collections.Generic;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Records the effects of stand-in actions (<see cref="RecordEffect"/>) for systems that do not exist yet (moving NPC groups,
    /// bandits fleeing). Registered as a service in the test environment.
    /// </summary>
    public sealed class EffectLog
    {
        private readonly List<string> _entries = new List<string>();

        /// <summary>Entries in order: <c>&lt;source&gt;: &lt;text&gt;</c>.</summary>
        public IReadOnlyList<string> Entries => _entries;

        /// <summary>Records an entry.</summary>
        /// <param name="sourceId">Running dialogue.</param>
        /// <param name="text">Effect.</param>
        public void Add(string sourceId, string text)
        {
            _entries.Add(sourceId + ": " + text);
        }

        /// <summary>True if an entry contains the text.</summary>
        /// <param name="fragment">Text.</param>
        public bool Contains(string fragment)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Contains(fragment))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
