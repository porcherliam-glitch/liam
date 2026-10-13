using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Base class of all installers (architecture 4.1). One installer per system, stored as an asset in
    /// <c>Assets/_Project/Settings/Boot/</c> and listed in <see cref="BootConfig"/>. The bootstrapper lives in Core and
    /// never references higher assemblies; it only knows this base class.
    /// </summary>
    /// <remarks>
    /// <para><see cref="Install"/> only creates services and registers them. Loading data belongs into
    /// <see cref="IInitializable.InitializeAsync"/>, subscribing to foreign events into <see cref="IPostInitializable.PostInitialize"/>.</para>
    /// <para><see cref="Provides"/> must list exactly the interfaces registered in <see cref="Install"/>.
    /// The bootstrapper validates the order with these declarations before any installer runs and verifies
    /// them against the real Register calls afterwards (fail-fast in both cases).</para>
    /// </remarks>
    public abstract class ServiceInstaller : ScriptableObject, IInstallerDescription
    {
        /// <summary>Service interfaces this installer registers (exactly those passed to <see cref="IServiceRegistry.Register{T}"/>).</summary>
        public abstract IEnumerable<Type> Provides { get; }

        /// <summary>Service interfaces that earlier installers must have registered. Default: none.</summary>
        public virtual IEnumerable<Type> Requires => Array.Empty<Type>();

        /// <inheritdoc />
        string IInstallerDescription.DisplayName => name;

        /// <summary>Creates the services of this system and registers them. Called once per boot on the main thread.</summary>
        /// <param name="registry">Registry to register the created services in.</param>
        /// <param name="locator">Locator to resolve services of earlier installers (listed in <see cref="Requires"/>).</param>
        public abstract void Install(IServiceRegistry registry, IServiceLocator locator);
    }
}
