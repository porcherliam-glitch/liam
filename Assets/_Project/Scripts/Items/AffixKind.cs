namespace Aetherfall.Items
{
    /// <summary>Prefix (attack and core values) or suffix (defence, attributes, utility), GDD 04 4.3. Stored in assets: never renumber.</summary>
    public enum AffixKind
    {
        /// <summary>Prefix (German "Praefix"), at most 2 per item.</summary>
        Prefix = 0,

        /// <summary>Suffix, at most 2 per item.</summary>
        Suffix = 1
    }
}
