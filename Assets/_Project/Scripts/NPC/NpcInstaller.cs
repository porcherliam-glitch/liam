using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Dialogue;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Registers the NPC system (architecture 4.1 step 13, world and actor services: after AI, before Companions and Quests):
    /// <see cref="INpcService"/> and <see cref="IDialogueSpeakerDirectory"/> (<see cref="NpcService"/>) and the saveable of the
    /// section <c>npcs</c>. Builds the NPC catalog from the <see cref="NpcDefinition"/>s of the content database.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/NpcInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot > Installer:
    /// NPCs). Order in the BootConfig: after the Dialogue installer (the dialogue service picks the speaker directory up in its
    /// PostInitialize), before the Quest installer.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: NPCs", fileName = "NpcInstaller", order = 117)]
    public sealed class NpcInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(INpcService), typeof(IDialogueSpeakerDirectory) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IContentDatabase), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            NpcCatalog catalog = NpcCatalog.FromDatabase(locator.Get<IContentDatabase>());
            var service = new NpcService(locator.Get<IEventBus>(), catalog);
            locator.Get<ISaveManager>().Register(new NpcSaveable(service));
            Log.Info(LogCategory.NPC, "NPCs: " + catalog.Count + " NPC definitions.");
            registry.Register<INpcService>(service);
            registry.Register<IDialogueSpeakerDirectory>(service);
        }
    }
}
