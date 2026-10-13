using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Boot configuration (architecture 4.1, ADR A07): the ordered list of <see cref="ServiceInstaller"/> assets and the
    /// initialization timeout. Lives in <c>Assets/_Project/Settings/Boot/</c> and is referenced by <see cref="GameBootstrapper"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Boot-Konfiguration", fileName = "BootConfig", order = 0)]
    public sealed class BootConfig : ScriptableObject
    {
        /// <summary>Default value of <see cref="InitializationTimeoutSeconds"/> (architecture 4.1: 20 s).</summary>
        public const float DefaultInitializationTimeoutSeconds = 20f;

        [Header("Installer")]
        [Tooltip("Geordnete Liste der Installer. Die Reihenfolge ist die Installationsreihenfolge (Architektur 4.1): " +
                 "Log → EventBus → GameState → … Jeder Installer darf nur Dienste früherer Installer benötigen; " +
                 "das wird beim Start geprüft (Fail-Fast).")]
        [SerializeField] private List<ServiceInstaller> installers = new List<ServiceInstaller>();

        [Header("Initialisierung")]
        [Tooltip("Maximale Dauer der asynchronen Initialisierung aller Dienste in Sekunden. Wird sie überschritten, " +
                 "bricht der Start ab und zeigt den Fehlerbildschirm. Zum Debuggen mit Haltepunkten vorübergehend erhöhen.")]
        [Min(1f)]
        [SerializeField] private float initializationTimeoutSeconds = DefaultInitializationTimeoutSeconds;

        /// <summary>Installers in boot order. Entries can be null (empty inspector slots or missing assets).</summary>
        public IReadOnlyList<ServiceInstaller> Installers => installers;

        /// <summary>Maximum real time for all <see cref="IInitializable.InitializeAsync"/> calls together, in seconds.</summary>
        public float InitializationTimeoutSeconds => initializationTimeoutSeconds;
    }
}
