namespace Aetherfall.UI.Framework
{
    /// <summary>HUD modes of GDD 05 1.2 (option "HUD-Anzeige").</summary>
    public enum HudMode
    {
        /// <summary>Default: elements appear by the rules of GDD 05 1.2 (last column).</summary>
        Contextual = 0,

        /// <summary>All elements are always visible.</summary>
        Full = 1,

        /// <summary>Only interaction, boss bar, P0 banner and game relevant meters; health appears below 30 %.</summary>
        Minimal = 2
    }
}
