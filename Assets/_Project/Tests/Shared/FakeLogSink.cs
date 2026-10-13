using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Tests
{
    /// <summary>
    /// <see cref="ILogSink"/> test double that records every message instead of printing it.
    /// Usually installed through <see cref="LogCapture"/>.
    /// </summary>
    public sealed class FakeLogSink : ILogSink
    {
        private readonly List<CapturedLogEntry> _entries = new List<CapturedLogEntry>();

        /// <summary>All recorded messages in call order.</summary>
        public IReadOnlyList<CapturedLogEntry> Entries => _entries;

        /// <inheritdoc />
        public void Write(LogLevel level, LogCategory category, string message, Exception exception)
        {
            _entries.Add(new CapturedLogEntry(level, category, message, exception));
        }

        /// <summary>Number of messages with exactly this level.</summary>
        /// <param name="level">Level to count.</param>
        public int Count(LogLevel level)
        {
            int count = 0;
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Level == level)
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>Number of messages with level Error or Fatal.</summary>
        public int ErrorCount => Count(LogLevel.Error) + Count(LogLevel.Fatal);

        /// <summary>True if a message with this level contains <paramref name="fragment"/> (ordinal comparison).</summary>
        /// <param name="level">Level of the message.</param>
        /// <param name="fragment">Text the message must contain.</param>
        public bool Contains(LogLevel level, string fragment)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Level == level && _entries[i].Message.IndexOf(fragment, StringComparison.Ordinal) >= 0)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Removes all recorded messages.</summary>
        public void Clear()
        {
            _entries.Clear();
        }

        /// <summary>All messages as text, one per line (for assertion messages).</summary>
        public string Dump()
        {
            var lines = new string[_entries.Count];
            for (int i = 0; i < lines.Length; i++)
            {
                lines[i] = _entries[i].ToString();
            }

            return string.Join("\n", lines);
        }
    }
}
