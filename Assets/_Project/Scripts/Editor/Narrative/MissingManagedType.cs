namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// One <c>[SerializeReference]</c> entry of an asset whose class Unity cannot find any more (architecture 6.4 and 7.6
    /// no. 6, GDD 02 rule V14): the class was renamed or moved without <c>[MovedFrom]</c>, deleted, or lives in an assembly
    /// that is not loaded. Unity keeps the data in the asset until it is overwritten or cleared. Copy of Unity's
    /// <c>ManagedReferenceMissingType</c> without the serialized data.
    /// </summary>
    public readonly struct MissingManagedType
    {
        /// <summary>Creates the entry.</summary>
        /// <param name="assemblyName">Assembly the class was stored with, e.g. <c>Aetherfall.Quests</c>.</param>
        /// <param name="namespaceName">Namespace the class was stored with.</param>
        /// <param name="className">Class name the class was stored with.</param>
        /// <param name="referenceId">Managed reference id (rid) inside the asset.</param>
        public MissingManagedType(string assemblyName, string namespaceName, string className, long referenceId)
        {
            AssemblyName = assemblyName ?? string.Empty;
            NamespaceName = namespaceName ?? string.Empty;
            ClassName = className ?? string.Empty;
            ReferenceId = referenceId;
        }

        /// <summary>Assembly the class was stored with.</summary>
        public string AssemblyName { get; }

        /// <summary>Namespace the class was stored with.</summary>
        public string NamespaceName { get; }

        /// <summary>Class name the class was stored with.</summary>
        public string ClassName { get; }

        /// <summary>Managed reference id (rid) inside the asset.</summary>
        public long ReferenceId { get; }

        /// <summary>Namespace and class, e.g. <c>Aetherfall.Quests.KillObjective</c>.</summary>
        public string FullName => NamespaceName.Length > 0 ? NamespaceName + "." + ClassName : ClassName;

        /// <inheritdoc />
        public override string ToString()
        {
            return FullName + " (" + AssemblyName + ", rid " + ReferenceId + ")";
        }
    }
}
