namespace Aetherfall.Stats
{
    /// <summary>
    /// How a <see cref="StatModifier"/> changes a value (GDD 03 10.4):
    /// <c>Value = (Base + Σ Flat) × (1 + Σ PercentAdd) × Π (1 + PercentMult_i)</c>, then soft cap, then min/max.
    /// Values are stored in assets: never renumber.
    /// </summary>
    public enum StatModifierKind
    {
        /// <summary>Added to the base value (item base values, affixes "+X", attribute contributions).</summary>
        Flat = 0,

        /// <summary>Summed up with all other additive percentages (skills, buffs, potions, food, affixes "+X %").</summary>
        PercentAdd = 1,

        /// <summary>Multiplied individually (key nodes, legendary effects, set bonuses, world tiers); at most 3 per value.</summary>
        PercentMult = 2
    }
}
