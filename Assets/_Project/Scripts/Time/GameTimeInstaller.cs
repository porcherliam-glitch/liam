using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// Registers <see cref="IPlaytimeClock"/> (<see cref="PlaytimeClock"/>) and registers it with the save manager as
    /// saveable (section <c>time</c>) and header contributor (architecture 4.1, step 10). Requires
    /// <see cref="IGameStateService"/> and <see cref="ISaveManager"/>, so it comes directly after the save installer.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Spielzeit", fileName = "GameTimeInstaller", order = 105)]
    public sealed class GameTimeInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IPlaytimeClock) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IGameStateService), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var clock = new PlaytimeClock(locator.Get<IGameStateService>());
            ISaveManager saves = locator.Get<ISaveManager>();
            saves.Register(clock);
            saves.RegisterHeaderContributor(clock);
            registry.Register<IPlaytimeClock>(clock);
        }
    }
}
