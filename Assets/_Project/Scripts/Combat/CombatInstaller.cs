using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Registers <see cref="ICombatService"/> (<see cref="CombatService"/>; architecture 4.1 step 12, "Combat-Konfiguration").
    /// Requires <see cref="IEventBus"/>. The menu "Aetherfall > Testgelaende erstellen" (German menu text) puts it into the
    /// BootConfig behind the GameTime installer.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Kampf", fileName = "CombatInstaller", order = 110)]
    public sealed class CombatInstaller : ServiceInstaller
    {
        [Tooltip("Kampf-Einstellungen für das Treffer-Gefühl (Hitstop-Faktor). Leer = Werte aus GDD 03, 4.11.")]
        [SerializeField] private CombatSettings settings = null;

        [Tooltip("Startwert des Zufallsgenerators für kritische Treffer. 0 = jedes Mal anders (Uhrzeit).")]
        [SerializeField] private int randomSeed = 0;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ICombatService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            ulong seed = randomSeed != 0 ? (ulong)randomSeed : (ulong)DateTime.UtcNow.Ticks;
            HitFeedbackTable feedback = settings != null ? settings.CreateFeedbackTable() : new HitFeedbackTable();
            registry.Register<ICombatService>(new CombatService(locator.Get<IEventBus>(), new DamageCalculator(), new Pcg32Random(seed), feedback));
        }
    }
}
