using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Exploration;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Makes the world object states saveable (section <c>worldobjects</c>, <see cref="WorldObjectsSaveable"/>), the exploration of
    /// the maps (section <c>world</c>, <see cref="ExplorationSaveable"/>) and registers the
    /// autosave of world triggers (<see cref="IWorldAutosave"/>, <see cref="WorldSaveBridge"/>: checkpoints, dungeon exits, no
    /// saving during a boss fight). Requires <see cref="IWorldObjectStateStore"/>, <see cref="ISaveManager"/>,
    /// <see cref="IEventBus"/> and <see cref="IExplorationService"/>.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/WorldSaveInstaller.asset</c>; the menu "Aetherfall > Gruft erstellen" puts it into
    /// the BootConfig behind the installers of the world objects and the save system.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Weltobjekte speichern", fileName = "WorldSaveInstaller", order = 119)]
    public sealed class WorldSaveInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IWorldAutosave) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires =>
            new[] { typeof(IWorldObjectStateStore), typeof(ISaveManager), typeof(IEventBus), typeof(IExplorationService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var saves = locator.Get<ISaveManager>();
            saves.Register(new WorldObjectsSaveable(locator.Get<IWorldObjectStateStore>()));
            saves.Register(new ExplorationSaveable(locator.Get<IExplorationService>()));
            registry.Register<IWorldAutosave>(new WorldSaveBridge(saves, locator.Get<IEventBus>()));
        }
    }
}
