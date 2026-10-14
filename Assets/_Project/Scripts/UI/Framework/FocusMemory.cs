using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Remembers the last focused index per page, tab or list of a screen (GDD 05 1.4 "Fokus-Gedaechtnis"), so switching back
    /// to a tab returns to the item that was focused there. Pure logic.
    /// </summary>
    public sealed class FocusMemory
    {
        private readonly Dictionary<string, int> _indices = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <summary>Stores the index of a page.</summary>
        /// <param name="pageKey">Page or tab key.</param>
        /// <param name="index">Focused index (negative values are ignored).</param>
        public void Remember(string pageKey, int index)
        {
            if (string.IsNullOrEmpty(pageKey) || index < 0)
            {
                return;
            }

            _indices[pageKey] = index;
        }

        /// <summary>Returns the stored index of a page, or <paramref name="fallback"/>.</summary>
        /// <param name="pageKey">Page or tab key.</param>
        /// <param name="fallback">Index if nothing was stored.</param>
        public int Recall(string pageKey, int fallback = 0)
        {
            return !string.IsNullOrEmpty(pageKey) && _indices.TryGetValue(pageKey, out int index) ? index : fallback;
        }

        /// <summary>Forgets all pages.</summary>
        public void Clear()
        {
            _indices.Clear();
        }
    }
}
