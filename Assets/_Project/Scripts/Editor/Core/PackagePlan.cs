using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Result of <see cref="PackagePlanner.CreatePlan"/>: which packages to add and remove in one Package Manager call,
    /// plus German notes for the log. Plain data without Unity calls.
    /// </summary>
    public sealed class PackagePlan
    {
        private readonly List<string> _packagesToAdd;
        private readonly List<string> _packagesToRemove;
        private readonly List<string> _notes;

        /// <summary>Creates a plan. The lists are copied.</summary>
        /// <param name="packagesToAdd">Package specifications for <c>Client.AddAndRemove</c> ("name" or "name@version").</param>
        /// <param name="packagesToRemove">Package names to remove.</param>
        /// <param name="notes">German notes for the log.</param>
        public PackagePlan(IEnumerable<string> packagesToAdd, IEnumerable<string> packagesToRemove, IEnumerable<string> notes)
        {
            _packagesToAdd = packagesToAdd == null ? new List<string>() : new List<string>(packagesToAdd);
            _packagesToRemove = packagesToRemove == null ? new List<string>() : new List<string>(packagesToRemove);
            _notes = notes == null ? new List<string>() : new List<string>(notes);
        }

        /// <summary>Package specifications to add: "name" (version recommended by the editor) or "name@version" (pinned).</summary>
        public IReadOnlyList<string> PackagesToAdd => _packagesToAdd;

        /// <summary>Package names to remove.</summary>
        public IReadOnlyList<string> PackagesToRemove => _packagesToRemove;

        /// <summary>German notes for the log (e.g. packages that cannot be removed).</summary>
        public IReadOnlyList<string> Notes => _notes;

        /// <summary>True if nothing has to be added or removed.</summary>
        public bool IsEmpty => _packagesToAdd.Count == 0 && _packagesToRemove.Count == 0;
    }
}
