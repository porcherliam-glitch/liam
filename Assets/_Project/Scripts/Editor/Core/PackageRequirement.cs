namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// A package the project needs (architecture 1.4, §4.2): package ID, purpose and the planned version line.
    /// Plain data without Unity calls.
    /// </summary>
    public sealed class PackageRequirement
    {
        /// <summary>Creates a requirement.</summary>
        /// <param name="packageId">Exact package name, e.g. "com.unity.cinemachine".</param>
        /// <param name="purpose">German purpose shown in the setup window.</param>
        /// <param name="expectedVersionLine">
        /// Planned version line from architecture 1.4, e.g. "3.1" (any 3.1.x) or "3.2.2" (exactly this version).
        /// Empty if the version is bound to the editor (core packages).
        /// </param>
        public PackageRequirement(string packageId, string purpose, string expectedVersionLine)
        {
            PackageId = packageId ?? string.Empty;
            Purpose = purpose ?? string.Empty;
            ExpectedVersionLine = expectedVersionLine ?? string.Empty;
        }

        /// <summary>Exact package name.</summary>
        public string PackageId { get; }

        /// <summary>German purpose shown in the setup window.</summary>
        public string Purpose { get; }

        /// <summary>Planned version line, or empty if the version is bound to the editor.</summary>
        public string ExpectedVersionLine { get; }
    }
}
