using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Registers the boss health bar source (<see cref="IBossBarService"/>, <see cref="BossBarService"/>). Without it a boss
    /// still fights, only the bar stays empty.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/BossInstaller.asset</c>; the menu "Aetherfall > Gruft erstellen" puts it into the
    /// BootConfig behind the AI installer.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Bosse", fileName = "BossInstaller", order = 112)]
    public sealed class BossInstaller : ServiceInstaller
    {
        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IBossBarService) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            registry.Register<IBossBarService>(new BossBarService());
        }
    }
}
