using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Registers <see cref="ITimeScaleService"/> (<see cref="UnityTimeScaleService"/>) and <see cref="IGameStateService"/>
    /// (<see cref="GameStateService"/>, starts in <see cref="GameState.Boot"/>). Requires <see cref="IEventBus"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: GameState", fileName = "GameStateInstaller", order = 102)]
    public sealed class GameStateInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ITimeScaleService), typeof(IGameStateService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var timeScale = new UnityTimeScaleService();
            registry.Register<ITimeScaleService>(timeScale);
            registry.Register<IGameStateService>(new GameStateService(locator.Get<IEventBus>(), timeScale));
        }
    }
}
