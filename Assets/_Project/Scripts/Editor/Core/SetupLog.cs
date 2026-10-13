using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Protocol of the project setup window: every action of a setup step is written here and mirrored to the Unity
    /// console with the prefix "[Aetherfall-Setup]". Serializable, so the protocol survives the domain reloads that
    /// package changes and script compilation cause while the window is open.
    /// </summary>
    [Serializable]
    internal sealed class SetupLog
    {
        private const int MaxEntries = 500;
        private const string ConsolePrefix = "[Aetherfall-Setup] ";

        [SerializeField] private List<string> entries = new List<string>();

        /// <summary>Raised after an entry was added or the protocol was cleared.</summary>
        public event Action Changed;

        /// <summary>All entries, oldest first.</summary>
        public IReadOnlyList<string> Entries => GetEntries();

        /// <summary>Writes an informational entry.</summary>
        /// <param name="message">German message.</param>
        public void Info(string message)
        {
            Add("    ", message);
            Debug.Log(ConsolePrefix + message);
        }

        /// <summary>Writes a warning (something the user should look at).</summary>
        /// <param name="message">German message.</param>
        public void Warning(string message)
        {
            Add("WARN", message);
            Debug.LogWarning(ConsolePrefix + message);
        }

        /// <summary>Writes an error (a step could not complete an action).</summary>
        /// <param name="message">German message.</param>
        public void Error(string message)
        {
            Add("FEHL", message);
            Debug.LogError(ConsolePrefix + message);
        }

        /// <summary>Removes all entries.</summary>
        public void Clear()
        {
            GetEntries().Clear();
            Changed?.Invoke();
        }

        /// <summary>Returns the protocol as text, one entry per line.</summary>
        public string ToText()
        {
            List<string> list = GetEntries();
            var builder = new StringBuilder();
            for (int i = 0; i < list.Count; i++)
            {
                builder.Append(list[i]).Append('\n');
            }

            return builder.ToString();
        }

        private void Add(string level, string message)
        {
            List<string> list = GetEntries();
            list.Add(DateTime.Now.ToString("HH:mm:ss") + " " + level + " " + (message ?? string.Empty));
            if (list.Count > MaxEntries)
            {
                list.RemoveRange(0, list.Count - MaxEntries);
            }

            Changed?.Invoke();
        }

        private List<string> GetEntries()
        {
            if (entries == null)
            {
                entries = new List<string>();
            }

            return entries;
        }
    }
}
