using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;
using Aetherfall.World;
using Aetherfall.WorldState;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Registers <see cref="IQuestService"/> (<see cref="QuestService"/>) and the saveable of the section <c>quests</c>
    /// (architecture 4.1 step 13 "Quests", last of the world and actor services). Builds the quest catalog from the
    /// <see cref="QuestDefinition"/>s of the content database. The service is ticked (time limits, cool-downs), post-initialized
    /// (start conditions) and disposed by the bootstrapper. If the World installer registered an <see cref="ISpawnGroupRegistry"/>,
    /// it also registers its saveable (section <c>spawners</c>, <see cref="SpawnGroupSaveable"/>).
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/QuestInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot > Installer:
    /// Quests). Order in the BootConfig: after the Inventory installer (and all other domain installers, also the World installer).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Quests", fileName = "QuestInstaller", order = 115)]
    public sealed class QuestInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IQuestService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[]
        {
            typeof(IEventBus), typeof(IContentDatabase), typeof(ISaveManager), typeof(IConditionWatcher), typeof(IWorldState),
            typeof(IInventoryService), typeof(IPlaytimeClock)
        };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            QuestCatalog catalog = QuestCatalog.FromDatabase(locator.Get<IContentDatabase>());
            ISaveManager saves = locator.Get<ISaveManager>();
            var service = new QuestService(
                locator.Get<IEventBus>(),
                catalog,
                locator,
                locator.Get<IConditionWatcher>(),
                new InventoryQuestBridge(locator.Get<IInventoryService>()),
                locator.Get<IWorldState>(),
                locator.Get<IPlaytimeClock>(),
                saves);
            saves.Register(new QuestSaveable(service));
            if (locator.TryGet(out ISpawnGroupRegistry spawnGroups))
            {
                saves.Register(new SpawnGroupSaveable(spawnGroups));
            }
            else
            {
                Log.Warning(LogCategory.Quests, "No ISpawnGroupRegistry (WorldInstaller missing in the BootConfig): enemy groups of quests are not saved.");
            }

            Log.Info(LogCategory.Quests, "Quests: " + catalog.Count + " quest definitions.");
            registry.Register<IQuestService>(service);
        }
    }
}
