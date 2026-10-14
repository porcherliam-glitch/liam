using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Which scene belongs to which world space (guide 12, 11.5): <c>worldspace.eichental.mini_slice</c> → the village,
    /// <c>worldspace.eichental.gruft</c> → the crypt. The game flow reads the world space of a save from its header and opens
    /// that scene before it loads; unknown or empty ids fall back to the default gameplay scene. Pure logic.
    /// </summary>
    public sealed class WorldSpaceDirectory
    {
        private readonly Dictionary<string, Entry> _entries = new Dictionary<string, Entry>(StringComparer.Ordinal);

        /// <summary>Number of known world spaces.</summary>
        public int Count => _entries.Count;

        /// <summary>Adds or replaces a world space. Entries with an empty id or scene are ignored.</summary>
        /// <param name="worldSpaceId">World space id.</param>
        /// <param name="sceneKey">Scene path (as in the scene list).</param>
        /// <param name="title">Title on the loading screen.</param>
        public void Add(string worldSpaceId, string sceneKey, string title)
        {
            if (string.IsNullOrEmpty(worldSpaceId) || string.IsNullOrEmpty(sceneKey))
            {
                return;
            }

            _entries[worldSpaceId] = new Entry(sceneKey, title ?? string.Empty);
        }

        /// <summary>Looks up the scene of a world space.</summary>
        /// <param name="worldSpaceId">World space id (may be null or empty).</param>
        /// <param name="sceneKey">Scene path, or empty.</param>
        /// <param name="title">Loading screen title, or empty.</param>
        /// <returns>True if the world space is known.</returns>
        public bool TryResolve(string worldSpaceId, out string sceneKey, out string title)
        {
            if (!string.IsNullOrEmpty(worldSpaceId) && _entries.TryGetValue(worldSpaceId, out Entry entry))
            {
                sceneKey = entry.SceneKey;
                title = entry.Title;
                return true;
            }

            sceneKey = string.Empty;
            title = string.Empty;
            return false;
        }

        /// <summary>Title of the scene, or empty if no world space uses it.</summary>
        /// <param name="sceneKey">Scene path.</param>
        public string TitleOfScene(string sceneKey)
        {
            foreach (KeyValuePair<string, Entry> pair in _entries)
            {
                if (string.Equals(pair.Value.SceneKey, sceneKey, StringComparison.Ordinal))
                {
                    return pair.Value.Title;
                }
            }

            return string.Empty;
        }

        private readonly struct Entry
        {
            public Entry(string sceneKey, string title)
            {
                SceneKey = sceneKey;
                Title = title;
            }

            public string SceneKey { get; }

            public string Title { get; }
        }
    }
}
