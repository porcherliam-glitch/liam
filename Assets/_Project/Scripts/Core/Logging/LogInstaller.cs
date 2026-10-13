using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// First installer of the boot sequence (architecture 4.1, step 1): applies <see cref="LogSettings"/> to <see cref="Log"/>.
    /// Registers no service. Without a settings asset the defaults of <see cref="Log"/> stay active.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Log", fileName = "LogInstaller", order = 100)]
    public sealed class LogInstaller : ServiceInstaller
    {
        [Tooltip("Log-Einstellungen (Mindest-Stufe global und je Kategorie). Leer = Standardwerte (global 'Info').")]
        [SerializeField] private LogSettings logSettings;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => Array.Empty<Type>();

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            if (logSettings == null)
            {
                Log.Info(LogCategory.Core, "No LogSettings assigned to '" + name + "'. Using defaults (global minimum level " + Log.DefaultMinLevel + ").");
                return;
            }

            Log.SetGlobalMinLevel(logSettings.GlobalMinLevel);
            Log.ClearAllCategoryMinLevels();

            IReadOnlyList<LogCategoryLevel> levels = logSettings.CategoryLevels;
            for (int i = 0; i < levels.Count; i++)
            {
                LogCategoryLevel entry = levels[i];
                if (Log.HasMinLevel(entry.Category))
                {
                    Log.Warning(LogCategory.Core, "LogSettings '" + logSettings.name + "' lists category " + entry.Category + " more than once. The last entry wins.");
                }

                Log.SetMinLevel(entry.Category, entry.MinLevel);
            }

            Log.Info(LogCategory.Core, "Log settings applied from '" + logSettings.name + "': global minimum level " + logSettings.GlobalMinLevel + ", " + levels.Count + " category level(s).");
        }
    }
}
