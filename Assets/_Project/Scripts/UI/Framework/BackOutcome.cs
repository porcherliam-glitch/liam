namespace Aetherfall.UI.Framework
{
    /// <summary>What a screen does with Back (B / Esc) or Close (Start / Esc).</summary>
    public enum BackOutcome
    {
        /// <summary>Nothing (e.g. the main menu or the death screen cannot be left with Back).</summary>
        Ignored = 0,

        /// <summary>The screen handled it itself (e.g. returned from a sub-page to its main page).</summary>
        Handled = 1,

        /// <summary>The screen wants to be closed.</summary>
        Close = 2
    }
}
