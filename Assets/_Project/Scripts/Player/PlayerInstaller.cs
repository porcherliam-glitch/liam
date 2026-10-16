using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;
using Aetherfall.World.Exploration;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Registers the services of the player step that are not components of the player object: <see cref="IFastTravelService"/>
    /// (S50, fast travel between the discovered travel points of the map, the clock jumps by the travel time).
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/PlayerInstaller.asset</c>. Order in the BootConfig: behind the combat and AI
    /// installers (it needs the combat state, the inventory, the game clock, the save system and the world map); the menus
    /// "Aetherfall > Testgelaende erstellen" and "Aetherfall > Eichental erstellen" put it there.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Spieler", fileName = "PlayerInstaller", order = 125)]
    public sealed class PlayerInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IFastTravelService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[]
        {
            typeof(IExplorationService), typeof(IPlayerLocator), typeof(IGameStateService), typeof(IGameClock), typeof(ICombatService),
            typeof(IInventoryService), typeof(ISaveManager), typeof(IEventBus)
        };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<IFastTravelService>(new FastTravelService(locator.Get<IExplorationService>(), locator.Get<IPlayerLocator>(),
                locator.Get<IGameStateService>(), locator.Get<IGameClock>(), locator.Get<ICombatService>(), locator.Get<IInventoryService>(),
                locator.Get<ISaveManager>(), locator.Get<IEventBus>()));
        }
    }
}
