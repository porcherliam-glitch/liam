namespace Aetherfall.Items
{
    /// <summary>
    /// One rolled affix of an item instance (GDD 04 4.9: <c>{ "id": "affix.lodernd", "tier": 3, "value": 11 }</c>): affix id,
    /// tier I–VI as 1–6 and the value in display units (11 = +11 %, see <see cref="AffixSpec.ValueScale"/>).
    /// </summary>
    public readonly struct AffixRoll
    {
        /// <summary>Affix id, e.g. <c>affix.grausam</c>.</summary>
        public readonly string AffixId;

        /// <summary>Tier 1–6 (I–VI).</summary>
        public readonly int Tier;

        /// <summary>Rolled value in display units.</summary>
        public readonly float Value;

        /// <summary>Creates the roll.</summary>
        /// <param name="affixId">Affix id.</param>
        /// <param name="tier">Tier 1–6.</param>
        /// <param name="value">Value in display units.</param>
        public AffixRoll(string affixId, int tier, float value)
        {
            AffixId = affixId ?? string.Empty;
            Tier = tier;
            Value = value;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return AffixId + " " + Tier + ":" + Value;
        }
    }
}
