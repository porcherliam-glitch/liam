using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Registers day and night (S35): <see cref="ILightSourceRegistry"/> (fires and lamps register themselves) and
    /// <see cref="IDayNightService"/> (the light follows the game clock; the stealth AI reads the light factor). Requires the game
    /// time through the Core facade <see cref="IGameTimeSource"/>.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/DayNightInstaller.asset</c>. Order in the BootConfig: directly after the GameTime
    /// installer. The menus "Aetherfall > Testgelaende erstellen" and "Aetherfall > Eichental erstellen" put it there.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Tag und Nacht", fileName = "DayNightInstaller", order = 113)]
    public sealed class DayNightInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IDayNightService), typeof(ILightSourceRegistry) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IGameTimeSource) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var sources = new LightSourceRegistry();
            registry.Register<ILightSourceRegistry>(sources);
            registry.Register<IDayNightService>(new DayNightService(locator.Get<IGameTimeSource>(), sources));
        }
    }
}
