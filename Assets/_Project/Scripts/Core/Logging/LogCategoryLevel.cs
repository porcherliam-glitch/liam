using System;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Serializable pair "category → minimum level" used by <see cref="LogSettings"/>.
    /// </summary>
    [Serializable]
    public struct LogCategoryLevel
    {
        [Tooltip("Kategorie, für die eine eigene Mindest-Stufe gelten soll.")]
        [SerializeField] private LogCategory category;

        [Tooltip("Mindest-Stufe für diese Kategorie. Meldungen mit kleinerer Stufe werden verworfen. 'Off' schaltet die Kategorie stumm.")]
        [SerializeField] private LogLevel minLevel;

        /// <summary>Creates a pair (used by code and tests; the inspector edits the fields directly).</summary>
        /// <param name="category">Category to configure.</param>
        /// <param name="minLevel">Minimum level for the category.</param>
        public LogCategoryLevel(LogCategory category, LogLevel minLevel)
        {
            this.category = category;
            this.minLevel = minLevel;
        }

        /// <summary>Configured category.</summary>
        public LogCategory Category => category;

        /// <summary>Minimum level of the category.</summary>
        public LogLevel MinLevel => minLevel;
    }
}
