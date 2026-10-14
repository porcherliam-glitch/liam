namespace Aetherfall.UI.Screens
{
    /// <summary>One derived value on the character page ("Max. Lebenspunkte 250").</summary>
    public readonly struct CharacterValueRow
    {
        /// <summary>German label.</summary>
        public readonly string Label;

        /// <summary>Value text.</summary>
        public readonly string Value;

        /// <summary>Creates the row.</summary>
        /// <param name="label">Label.</param>
        /// <param name="value">Value.</param>
        public CharacterValueRow(string label, string value)
        {
            Label = label ?? string.Empty;
            Value = value ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Label + ": " + Value;
        }
    }
}
