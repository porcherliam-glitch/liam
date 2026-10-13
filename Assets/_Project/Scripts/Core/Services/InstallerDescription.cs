using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Immutable, plain-data <see cref="IInstallerDescription"/>. Used by tests and by code that needs to describe
    /// an installer without a ScriptableObject.
    /// </summary>
    public sealed class InstallerDescription : IInstallerDescription
    {
        private readonly Type[] _provides;
        private readonly Type[] _requires;

        /// <summary>Creates a description.</summary>
        /// <param name="displayName">Name used in error messages.</param>
        /// <param name="provides">Registered service interfaces (null = none).</param>
        /// <param name="requires">Required service interfaces (null = none).</param>
        public InstallerDescription(string displayName, IEnumerable<Type> provides = null, IEnumerable<Type> requires = null)
        {
            DisplayName = string.IsNullOrEmpty(displayName) ? "(unnamed installer)" : displayName;
            _provides = ToArray(provides);
            _requires = ToArray(requires);
        }

        /// <inheritdoc />
        public string DisplayName { get; }

        /// <inheritdoc />
        public IEnumerable<Type> Provides => _provides;

        /// <inheritdoc />
        public IEnumerable<Type> Requires => _requires;

        private static Type[] ToArray(IEnumerable<Type> types)
        {
            return types == null ? Array.Empty<Type>() : new List<Type>(types).ToArray();
        }
    }
}
