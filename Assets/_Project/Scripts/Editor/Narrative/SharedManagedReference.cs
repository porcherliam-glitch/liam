namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// A <c>[SerializeReference]</c> object that is stored at more than one place of an asset (same managed reference id):
    /// editing it at <see cref="Path"/> also changes it at <see cref="FirstPath"/>. Happens when Unity copies a list element
    /// ("+" on a list, duplicated stage) and the reference inside is not separated.
    /// </summary>
    public readonly struct SharedManagedReference
    {
        /// <summary>Creates the entry.</summary>
        /// <param name="referenceId">Shared managed reference id (rid).</param>
        /// <param name="firstPath">Property path of the first place (keeps the object).</param>
        /// <param name="path">Property path of a later place that shares it.</param>
        public SharedManagedReference(long referenceId, string firstPath, string path)
        {
            ReferenceId = referenceId;
            FirstPath = firstPath ?? string.Empty;
            Path = path ?? string.Empty;
        }

        /// <summary>Shared managed reference id (rid).</summary>
        public long ReferenceId { get; }

        /// <summary>Property path of the first place.</summary>
        public string FirstPath { get; }

        /// <summary>Property path of the later place that shares the object.</summary>
        public string Path { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return Path + " = " + FirstPath + " (rid " + ReferenceId + ")";
        }
    }
}
