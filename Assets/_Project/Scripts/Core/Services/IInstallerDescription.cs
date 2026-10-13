using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Declarative description of an installer: which service interfaces it registers and which it needs.
    /// Implemented by <see cref="ServiceInstaller"/> (asset) and <see cref="InstallerDescription"/> (plain data, tests),
    /// so that <see cref="InstallerOrderValidator"/> can check the boot order without Unity.
    /// </summary>
    public interface IInstallerDescription
    {
        /// <summary>Name shown in error messages (the asset name for installer assets).</summary>
        string DisplayName { get; }

        /// <summary>Service interfaces this installer registers. Must match the actual Register calls.</summary>
        IEnumerable<Type> Provides { get; }

        /// <summary>Service interfaces that earlier installers must have registered before this one runs.</summary>
        IEnumerable<Type> Requires { get; }
    }
}
