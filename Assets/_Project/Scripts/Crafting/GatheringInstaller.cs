using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Crafting
{
    /// <summary>
    /// Registers gathering (S30): <see cref="IGatheringService"/> for the harvest nodes of the world scenes.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/GatheringInstaller.asset</c>, in the BootConfig after the InventoryInstaller. The
    /// menus "Aetherfall > Eichental erstellen" and "Aetherfall > Testgelaende erstellen" put it there.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Sammeln", fileName = "GatheringInstaller", order = 120)]
    public sealed class GatheringInstaller : ServiceInstaller
    {
        [Tooltip("Startwert des Zufallsgenerators für den Ertrag. 0 = jedes Mal anders (Uhrzeit).")]
        [SerializeField] private int randomSeed = 0;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IGatheringService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IInventoryService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            ulong seed = randomSeed != 0 ? (ulong)randomSeed : (ulong)DateTime.UtcNow.Ticks;
            registry.Register<IGatheringService>(new GatheringService(locator.Get<IInventoryService>(), new Pcg32Random(seed)));
        }
    }
}
