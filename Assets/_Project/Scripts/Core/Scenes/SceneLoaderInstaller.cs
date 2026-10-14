using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Registers <see cref="ISceneLoader"/> (<see cref="SceneLoader"/> with <see cref="UnitySceneBackend"/>), boot step 8b of
    /// architecture 4.1: directly behind the GameState installer. The loading screen (<see cref="ILoadingScreen"/>, registered
    /// later by the UI installer) is resolved lazily at the first world space change.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: SceneLoader", fileName = "SceneLoaderInstaller", order = 104)]
    public sealed class SceneLoaderInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(ISceneLoader) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<ISceneLoader>(new SceneLoader(locator.Get<IEventBus>(), new UnitySceneBackend(), () =>
                locator.TryGet(out ILoadingScreen screen) ? screen : null));
        }
    }
}
