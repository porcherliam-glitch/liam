using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Items;
using Aetherfall.SaveSystem;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Registers <see cref="IInventoryService"/> (<see cref="InventoryService"/>) and <see cref="ILootService"/>
    /// (<see cref="LootService"/>) and the saveable of the section <c>inventory</c> (architecture 4.1 step 12 "Items/Loot,
    /// Inventory"). Builds the item catalog from the content database. Requires <see cref="IEventBus"/>,
    /// <see cref="IContentDatabase"/> and <see cref="ISaveManager"/>.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/InventoryInstaller.asset</c>; the menu "Aetherfall > Testgelaende erstellen"
    /// (German menu text) puts it into the BootConfig behind the Save, GameTime and Content installers and assigns the
    /// warrior's starting equipment.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Inventar", fileName = "InventoryInstaller", order = 108)]
    public sealed class InventoryInstaller : ServiceInstaller
    {
        [Tooltip("Startausrüstung eines neuen Spiels (Krieger: Einhandschwert, Holzschild, Gambeson, Lederstiefel, 3 Heiltränke).")]
        [SerializeField] private StartingEquipment startingEquipment = null;

        [Tooltip("Automatisch aufheben (GDD 05, 4.2): Aus, Gold und Materialien (Standard), Alles.")]
        [SerializeField] private AutoPickupMode autoPickup = AutoPickupMode.GoldAndMaterials;

        [Tooltip("Startwert der Zufallsgeneratoren (Spielstand-Seed der Beute, Item-IDs). 0 = jedes neue Spiel anders.")]
        [SerializeField] private int randomSeed = 0;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IInventoryService), typeof(ILootService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus), typeof(IContentDatabase), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            IEventBus eventBus = locator.Get<IEventBus>();
            ItemCatalog catalog = ItemCatalog.FromDatabase(locator.Get<IContentDatabase>());
            ulong seed = randomSeed != 0 ? (ulong)randomSeed : (ulong)DateTime.UtcNow.Ticks;
            var seedSource = new Pcg32Random(seed, 0x1f123bb5UL);
            StartingKit kit = startingEquipment != null ? startingEquipment.CreateKit() : StartingKit.Empty;
            if (startingEquipment == null)
            {
                Log.Warning(LogCategory.Data, "InventoryInstaller: no starting equipment assigned, a new game starts with an empty inventory.");
            }

            var inventory = new InventoryService(eventBus, catalog, ((ulong)seedSource.NextUInt() << 32) | seedSource.NextUInt(), kit);
            var loot = new LootService(eventBus, inventory, new LootRoller(catalog, inventory.Generator), seedSource, autoPickup);
            locator.Get<ISaveManager>().Register(new InventorySaveable(inventory, loot));
            Log.Info(LogCategory.Data, "Inventory: " + catalog.Items.Count + " items, " + catalog.Affixes.All.Count + " affixes, " +
                                       catalog.LootTables.Count + " loot tables.");
            registry.Register<IInventoryService>(inventory);
            registry.Register<ILootService>(loot);
        }
    }
}
