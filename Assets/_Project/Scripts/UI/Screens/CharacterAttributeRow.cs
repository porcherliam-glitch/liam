using Aetherfall.Stats;

namespace Aetherfall.UI.Screens
{
    /// <summary>One attribute on the character page: name, colour, value and the points placed while the menu is open.</summary>
    public readonly struct CharacterAttributeRow
    {
        /// <summary>Attribute.</summary>
        public readonly StatId Stat;

        /// <summary>German name ("Stärke").</summary>
        public readonly string Name;

        /// <summary>Colour class (<c>af-attr--strength</c>).</summary>
        public readonly string ColorClass;

        /// <summary>Value text (final value with all bonuses), "–" without a player.</summary>
        public readonly string Value;

        /// <summary>"+2" for points placed since the menu opened (can be taken back), otherwise empty.</summary>
        public readonly string Bonus;

        /// <summary>True if a point can be placed.</summary>
        public readonly bool CanSpend;

        /// <summary>True if a point can be taken back.</summary>
        public readonly bool CanRefund;

        /// <summary>Creates the row.</summary>
        /// <param name="stat">Attribute.</param>
        /// <param name="name">Name.</param>
        /// <param name="colorClass">Colour class.</param>
        /// <param name="value">Value text.</param>
        /// <param name="bonus">Bonus text.</param>
        /// <param name="canSpend">Point can be placed.</param>
        /// <param name="canRefund">Point can be taken back.</param>
        public CharacterAttributeRow(StatId stat, string name, string colorClass, string value, string bonus, bool canSpend, bool canRefund)
        {
            Stat = stat;
            Name = name ?? string.Empty;
            ColorClass = colorClass ?? string.Empty;
            Value = value ?? string.Empty;
            Bonus = bonus ?? string.Empty;
            CanSpend = canSpend;
            CanRefund = canRefund;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Name + " " + Value + (Bonus.Length > 0 ? " (" + Bonus + ")" : string.Empty);
        }
    }
}
