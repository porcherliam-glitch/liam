using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Registers <see cref="IConditionWatcher"/> (<see cref="ConditionWatcher"/>, architecture 4.1 step 11 "ConditionWatcher").
    /// Requires <see cref="IEventBus"/>. The watcher is an <see cref="ITickable"/> and <see cref="IDisposable"/>: the
    /// bootstrapper ticks and disposes it.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/ConditionsInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot >
    /// Installer: Bedingungen). Order in the BootConfig: after the GameTime installer, before the WorldState installer
    /// (docs/Anleitungen/08_Test_Quests.md, section "Integration").
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Bedingungen", fileName = "ConditionsInstaller", order = 106)]
    public sealed class ConditionsInstaller : ServiceInstaller
    {
        [Tooltip("Wie oft Bedingungen ohne Auslöser-Ereignis neu geprüft werden (Sekunden). Architektur 7.5: 1 s.")]
        [Min(0.1f)] [SerializeField] private float pollIntervalSeconds = ConditionWatcher.DefaultPollIntervalSeconds;

        [Tooltip("Zeitbudget pro Frame für das Neu-Prüfen in Millisekunden. Architektur 7.5: 0,5 ms.")]
        [Min(0.05f)] [SerializeField] private float budgetMilliseconds = (float)ConditionWatcher.DefaultBudgetMilliseconds;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IConditionWatcher) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var watcher = new ConditionWatcher(locator.Get<IEventBus>(), pollIntervalSeconds, budgetMilliseconds);
            registry.Register<IConditionWatcher>(watcher);
        }
    }
}
