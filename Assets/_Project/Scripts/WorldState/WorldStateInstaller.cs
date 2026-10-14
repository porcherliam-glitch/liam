using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.GameTime;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Registers <see cref="IWorldState"/> and <see cref="IWorldStateDebug"/> (<see cref="WorldStateService"/>) and the
    /// saveable of the section <c>worldstate</c> (architecture 4.1 step 11 "WorldState"). Builds the flag registry from the
    /// <see cref="FlagDefinition"/>s of the content database. Requires <see cref="IEventBus"/>, <see cref="IContentDatabase"/>,
    /// <see cref="ISaveManager"/> and <see cref="IPlaytimeClock"/>.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/WorldStateInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot >
    /// Installer: Weltzustand). Order in the BootConfig: after the Conditions installer, before the Inventory installer.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Weltzustand", fileName = "WorldStateInstaller", order = 107)]
    public sealed class WorldStateInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IWorldState), typeof(IWorldStateDebug) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IContentDatabase), typeof(ISaveManager), typeof(IPlaytimeClock) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            FlagRegistry flags = FlagRegistry.FromDatabase(locator.Get<IContentDatabase>());
            var service = new WorldStateService(locator.Get<IEventBus>(), flags, locator.Get<IPlaytimeClock>());
            locator.Get<ISaveManager>().Register(new WorldStateSaveable(service));
            Log.Info(LogCategory.World, "WorldState: " + flags.Count + " flag definitions.");
            registry.Register<IWorldState>(service);
            registry.Register<IWorldStateDebug>(service);
        }
    }
}
