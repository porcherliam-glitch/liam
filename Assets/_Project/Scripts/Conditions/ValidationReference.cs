namespace Aetherfall.Conditions
{
    /// <summary>
    /// An id referenced by validated data, collected by <see cref="IValidationReport.AddReference"/>. Validators resolve
    /// the collected references against the known content afterwards (V04 broken reference, V16 flag readers/writers, V17
    /// enum values).
    /// </summary>
    public readonly struct ValidationReference
    {
        /// <summary>Referenced id.</summary>
        public readonly string Id;

        /// <summary>Expected id prefix, e.g. <c>npc.</c>, <c>item.</c>, <c>flag.</c>; empty = any.</summary>
        public readonly string ExpectedPrefix;

        /// <summary>Kind of use.</summary>
        public readonly ReferenceUse Use;

        /// <summary>Compared or written value (flags), valid if <see cref="HasValue"/>.</summary>
        public readonly int Value;

        /// <summary>True if <see cref="Value"/> is set.</summary>
        public readonly bool HasValue;

        /// <summary>Location path where the reference was found.</summary>
        public readonly string Location;

        /// <summary>Creates the reference.</summary>
        /// <param name="id">Referenced id.</param>
        /// <param name="expectedPrefix">Expected prefix.</param>
        /// <param name="use">Kind of use.</param>
        /// <param name="value">Value (flags).</param>
        /// <param name="hasValue">True if <paramref name="value"/> is meaningful.</param>
        /// <param name="location">Location path.</param>
        public ValidationReference(string id, string expectedPrefix, ReferenceUse use, int value, bool hasValue, string location)
        {
            Id = id ?? string.Empty;
            ExpectedPrefix = expectedPrefix ?? string.Empty;
            Use = use;
            Value = value;
            HasValue = hasValue;
            Location = location ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Use + " " + Id + (HasValue ? " = " + Value : string.Empty) + " [" + Location + "]";
        }
    }
}
