using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.World.Exploration;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Registers the services of the world step that scene objects register with: <see cref="ISpawnGroupRegistry"/>
    /// (<see cref="SpawnGroupRegistry"/>, enemy groups that quests switch on), <see cref="IPlayerLocator"/> (the player registers
    /// itself) and <see cref="IExplorationService"/> (map, fog, discovered places, viewpoints; saved by the WorldSave installer). The section <c>spawners</c> (architecture 9.2) is
    /// saved by the Quests installer: this assembly must compile without the Newtonsoft package and therefore cannot reference
    /// the save system (asmdef <c>defineConstraints</c>).
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/WorldInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot > Installer:
    /// Welt). Order in the BootConfig: after the EventBus installer, before the Quest installer. The menus "Aetherfall >
    /// Testgelaende erstellen" and "Aetherfall > Eichental erstellen" put it there.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Welt", fileName = "WorldInstaller", order = 112)]
    public sealed class WorldInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ISpawnGroupRegistry), typeof(IPlayerLocator), typeof(IExplorationService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<ISpawnGroupRegistry>(new SpawnGroupRegistry());
            registry.Register<IPlayerLocator>(new PlayerLocator());
            registry.Register<IExplorationService>(new ExplorationService(locator.Get<IEventBus>()));
        }
    }
}
