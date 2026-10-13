using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Registers <see cref="ISaveManager"/> (<see cref="SaveManager"/> on the real file system below
    /// <see cref="UnitySaveLocation"/>) and the JSON facade <see cref="IJsonSerializer"/> (architecture 4.1, step 9).
    /// Requires <see cref="IEventBus"/> and <see cref="IGameStateService"/>; from here on saveables may register.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/SaveInstaller.asset</c>, in the BootConfig after the GameState and Input
    /// installers (the menu "Aetherfall > Testgelaende erstellen" (German menu text) puts it there). Validates the migration chain at boot
    /// ("Fehlt ein Glied, startet der Build nicht", architecture 9.5).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Speichern", fileName = "SaveInstaller", order = 104)]
    public sealed class SaveInstaller : ServiceInstaller
    {
        [Tooltip("Ordner des Spielstands (Charakter). Bis es eine Charaktererstellung gibt: char_01. Nur a–z, 0–9, _ und -.")]
        [SerializeField] private string characterId = SaveFormat.DefaultCharacterId;

        [Tooltip("Kompression der .sav-Dateien. Standard: im Editor und in Entwicklungs-Builds lesbares JSON, im Release GZip (Architektur 9.3).")]
        [SerializeField] private SaveCompressionMode compression = SaveCompressionMode.ReadableInDevelopment;

        [Tooltip("Automatisch speichern (Zeitintervall; weitere Auslöser wie Questfortschritt kommen mit den jeweiligen Systemen).")]
        [SerializeField] private bool autosaveEnabled = true;

        [Tooltip("Abstand der automatischen Speicherungen in Minuten Spielzeit (GDD 05, 5.3: 10). Zum Testen z. B. 1.")]
        [Range(0.5f, 60f)]
        [SerializeField] private float autosaveIntervalMinutes = 10f;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ISaveManager), typeof(IJsonSerializer) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IGameStateService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var settings = new SaveManagerSettings
            {
                CharacterId = string.IsNullOrEmpty(characterId) ? SaveFormat.DefaultCharacterId : characterId,
                Compress = ResolveCompression(compression),
                GameVersion = Application.version,
                AutosaveEnabled = autosaveEnabled,
                AutosaveIntervalSeconds = autosaveIntervalMinutes * 60f
            };

            // Throws (boot fails with a clear message) if the migration chain has a gap or the character id is invalid.
            var manager = new SaveManager(locator.Get<IEventBus>(), locator.Get<IGameStateService>(), new SystemFileStore(),
                UnitySaveLocation.Create(), settings);
            registry.Register<ISaveManager>(manager);
            registry.Register<IJsonSerializer>(new NewtonsoftJsonSerializer());
        }

        private static bool ResolveCompression(SaveCompressionMode mode)
        {
            switch (mode)
            {
                case SaveCompressionMode.Always:
                    return true;
                case SaveCompressionMode.Never:
                    return false;
                default:
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                    return false;
#else
                    return true;
#endif
            }
        }
    }
}
