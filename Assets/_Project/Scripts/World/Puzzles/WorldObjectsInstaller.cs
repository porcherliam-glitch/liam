using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.World.Dungeons;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Registers the world object states (<see cref="IWorldObjectStateStore"/>, <see cref="WorldObjectStateService"/>: puzzles,
    /// doors, levers, boss beaten …) and the arrival anchors of scene changes (<see cref="IWorldTravelService"/>). Requires
    /// <see cref="IEventBus"/>. Saving is added by the save installer of <c>Aetherfall.World.Gameplay</c> behind it.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/WorldObjectsInstaller.asset</c>; the menu "Aetherfall > Gruft erstellen" puts it
    /// into the BootConfig behind the EventBus installer.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Weltobjekte", fileName = "WorldObjectsInstaller", order = 118)]
    public sealed class WorldObjectsInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IWorldObjectStateStore), typeof(IWorldTravelService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<IWorldObjectStateStore>(new WorldObjectStateService(locator.Get<IEventBus>()));
            registry.Register<IWorldTravelService>(new WorldTravelService());
        }
    }
}
