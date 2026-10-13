using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>Protocol of one run of the test ground builder: lines for the console and the final dialog (German).</summary>
    public sealed class TestGroundReport
    {
        private readonly List<string> _lines = new List<string>();
        private readonly List<string> _warnings = new List<string>();

        /// <summary>Warnings collected so far (shown in the final dialog).</summary>
        public IReadOnlyList<string> Warnings => _warnings;

        /// <summary>Adds an info line.</summary>
        /// <param name="message">German text.</param>
        public void Info(string message)
        {
            _lines.Add(message);
        }

        /// <summary>Adds a warning (also logged as a console warning).</summary>
        /// <param name="message">German text.</param>
        public void Warning(string message)
        {
            _lines.Add("WARNUNG: " + message);
            _warnings.Add(message);
            Debug.LogWarning("[Testgelände] " + message);
        }

        /// <summary>Writes the whole protocol as one console message.</summary>
        public void LogToConsole()
        {
            var text = new StringBuilder("[Testgelände] Protokoll:\n");
            for (int i = 0; i < _lines.Count; i++)
            {
                text.Append("  ").Append(_lines[i]).Append('\n');
            }

            Debug.Log(text.ToString());
        }
    }
}
