using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Data asset with the log levels used at boot: one global minimum level plus optional levels per category.
    /// Applied by <see cref="LogInstaller"/> as the first boot step after the log sink is set.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Log-Einstellungen", fileName = "LogSettings", order = 10)]
    public sealed class LogSettings : ScriptableObject
    {
        [Header("Logging")]
        [Tooltip("Mindest-Stufe für alle Kategorien ohne eigene Einstellung. Standard: Info. Trace und Debug erscheinen nur im Editor und in Entwicklungs-Builds.")]
        [SerializeField] private LogLevel globalMinLevel = LogLevel.Info;

        [Tooltip("Abweichende Mindest-Stufen je Kategorie, z. B. 'Events' auf 'Debug', um den Event-Verkehr zu sehen. Pro Kategorie nur ein Eintrag.")]
        [SerializeField] private List<LogCategoryLevel> categoryLevels = new List<LogCategoryLevel>();

        /// <summary>Minimum level for all categories without an own entry.</summary>
        public LogLevel GlobalMinLevel => globalMinLevel;

        /// <summary>Category-specific minimum levels.</summary>
        public IReadOnlyList<LogCategoryLevel> CategoryLevels => categoryLevels;
    }
}
