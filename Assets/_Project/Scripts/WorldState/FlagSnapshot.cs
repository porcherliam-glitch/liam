namespace Aetherfall.WorldState
{
    /// <summary>One flag as shown by the debug console and the debug window (architecture 8.4, 14.2).</summary>
    public readonly struct FlagSnapshot
    {
        /// <summary>Flag id.</summary>
        public readonly string Id;

        /// <summary>Current value.</summary>
        public readonly int Value;

        /// <summary>Start value (0 for undefined flags).</summary>
        public readonly int DefaultValue;

        /// <summary>True if a <see cref="FlagDefinition"/> exists.</summary>
        public readonly bool IsDefined;

        /// <summary>Kind (<see cref="FlagKind.Counter"/> for undefined flags).</summary>
        public readonly FlagKind Kind;

        /// <summary>Playtime of the last change in seconds (0 if never changed in this game).</summary>
        public readonly double ChangedAtPlaytime;

        /// <summary>Display text of the value (<c>wahr</c>, <c>4 (Muehlenwache)</c>, <c>37</c>).</summary>
        public readonly string ValueText;

        /// <summary>Creates the snapshot.</summary>
        /// <param name="id">Flag id.</param>
        /// <param name="value">Current value.</param>
        /// <param name="defaultValue">Start value.</param>
        /// <param name="isDefined">True if defined.</param>
        /// <param name="kind">Kind.</param>
        /// <param name="changedAtPlaytime">Playtime of the last change.</param>
        /// <param name="valueText">Display text.</param>
        public FlagSnapshot(string id, int value, int defaultValue, bool isDefined, FlagKind kind, double changedAtPlaytime, string valueText)
        {
            Id = id ?? string.Empty;
            Value = value;
            DefaultValue = defaultValue;
            IsDefined = isDefined;
            Kind = kind;
            ChangedAtPlaytime = changedAtPlaytime;
            ValueText = valueText ?? string.Empty;
        }

        /// <summary>True if the value differs from the start value.</summary>
        public bool IsChanged => Value != DefaultValue;

        /// <inheritdoc />
        public override string ToString()
        {
            return Id + " = " + ValueText + (IsDefined ? string.Empty : " (nicht definiert)");
        }
    }
}
