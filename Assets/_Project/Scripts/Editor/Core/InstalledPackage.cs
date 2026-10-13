namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Snapshot of one package resolved by the Package Manager. Decouples the planning logic
    /// (<see cref="PackagePlanner"/>) from <c>UnityEditor.PackageManager.PackageInfo</c>, so it is testable without Unity.
    /// </summary>
    public readonly struct InstalledPackage
    {
        /// <summary>Creates a snapshot.</summary>
        /// <param name="name">Package name, e.g. "com.unity.timeline".</param>
        /// <param name="version">Resolved version, e.g. "1.8.9".</param>
        /// <param name="isDirectDependency">True if the package is listed in Packages/manifest.json.</param>
        public InstalledPackage(string name, string version, bool isDirectDependency)
        {
            Name = name ?? string.Empty;
            Version = version ?? string.Empty;
            IsDirectDependency = isDirectDependency;
        }

        /// <summary>Package name.</summary>
        public string Name { get; }

        /// <summary>Resolved version.</summary>
        public string Version { get; }

        /// <summary>True if the package is a direct dependency (entry in Packages/manifest.json).</summary>
        public bool IsDirectDependency { get; }
    }
}
