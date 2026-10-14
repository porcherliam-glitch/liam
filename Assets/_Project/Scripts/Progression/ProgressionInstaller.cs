using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Registers <see cref="IProgressionService"/> (<see cref="ProgressionService"/>) and the saveable of the section
    /// <c>progression</c> with its save header part (architecture 4.1 step 12 "Domaenendienste", 9.2 load order 40). Requires
    /// <see cref="IEventBus"/> and <see cref="ISaveManager"/>. The service listens to <c>EnemyKilled</c> from
    /// <c>PostInitialize</c> on and is disposed by the bootstrapper.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/ProgressionInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot >
    /// Installer: Fortschritt). Order in the BootConfig: after the Save installer, before the Quest installer (quest rewards
    /// give experience). The menu "Aetherfall > Testgelaende erstellen" (German menu text) adds it.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Fortschritt", fileName = "ProgressionInstaller", order = 109)]
    public sealed class ProgressionInstaller : ServiceInstaller
    {
        [Tooltip("XP-Kurve und Kampf-Erfahrung (GDD 03, 12.3 und 12.7). Leer = Werte aus dem GDD (200 · L · (1 + (L/30)²), Level 80).")]
        [SerializeField] private XpCurveSettings curve = null;

        [Tooltip("Startstufe neues Spiel (nur Test): Mit dieser Stufe beginnt ein neues Spiel. Im echten Spiel 1 (GDD 03, 12). " +
                 "Das Testgelände setzt 10 (Krieger aus GDD 03, 8.3, Anleitungen 05, 06 und 09). Vor dem Mini-Slice wieder auf 1 stellen.")]
        [Range(1, 80)] [SerializeField] private int newGameStartLevel = 1;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IProgressionService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            XpCurve xpCurve = curve != null ? curve.CreateCurve() : XpCurve.Default;
            KillXpRules killRules = curve != null ? curve.CreateKillRules() : new KillXpRules();
            var service = new ProgressionService(locator.Get<IEventBus>(), xpCurve, killRules, newGameStartLevel);
            var saveable = new ProgressionSaveable(service);
            ISaveManager saves = locator.Get<ISaveManager>();
            saves.Register(saveable);
            saves.RegisterHeaderContributor(saveable);
            Log.Info(LogCategory.Player, "Progression: level 1-" + xpCurve.MaxLevel + ", " + xpCurve.TotalToMaxLevel + " XP to the max level, " +
                                         "new games start at level " + service.StartLevel + (service.StartLevel > 1 ? " (test setting)." : "."));
            registry.Register<IProgressionService>(service);
        }
    }
}
