using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.Progression;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Economy
{
    /// <summary>
    /// Registers <see cref="IMerchantService"/> with every <see cref="MerchantDefinition"/> of the content database and its
    /// save section <c>merchants</c>. Needs the inventory (gold, bag); the playtime clock and the progression are optional
    /// (without them the stock never restocks and goods have item level 1).
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Händler", fileName = "MerchantInstaller", order = 112)]
    public sealed class MerchantInstaller : ServiceInstaller
    {
        [Tooltip("Startwert für die IDs gekaufter Gegenstände. 0 = jedes Spiel anders.")]
        [SerializeField] private int randomSeed = 0;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IMerchantService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IInventoryService), typeof(IContentDatabase), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            IInventoryService inventory = locator.Get<IInventoryService>();
            locator.TryGet(out IPlaytimeClock clock);
            locator.TryGet(out IProgressionService progression);
            IReadOnlyList<MerchantDefinition> merchants = locator.Get<IContentDatabase>().GetAll<MerchantDefinition>();
            ulong seed = randomSeed != 0 ? (ulong)randomSeed : (ulong)DateTime.UtcNow.Ticks;
            var service = new MerchantService(inventory, clock, progression != null ? (Func<int>)(() => progression.Level) : null, merchants, seed);
            locator.Get<ISaveManager>().Register(new MerchantSaveable(service));
            Log.Info(LogCategory.Data, "Merchants: " + merchants.Count + ".");
            registry.Register<IMerchantService>(service);
        }
    }
}
