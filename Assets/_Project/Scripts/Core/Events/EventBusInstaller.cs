using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>Registers the global <see cref="IEventBus"/> (architecture 4.1, step 3).</summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: EventBus", fileName = "EventBusInstaller", order = 101)]
    public sealed class EventBusInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IEventBus) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<IEventBus>(new EventBus());
        }
    }
}
