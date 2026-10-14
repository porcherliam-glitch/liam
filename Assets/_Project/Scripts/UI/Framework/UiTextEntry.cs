namespace Aetherfall.UI.Framework
{
    /// <summary>One entry of the central text table <see cref="UiTexts"/>: key and German text.</summary>
    public readonly struct UiTextEntry
    {
        /// <summary>Key (for static texts the name of the UXML element, e.g. <c>mainmenu-new-game</c>).</summary>
        public readonly string Key;

        /// <summary>German text (format templates use <c>{0}</c> placeholders).</summary>
        public readonly string Text;

        /// <summary>Creates an entry.</summary>
        /// <param name="key">Key.</param>
        /// <param name="text">German text.</param>
        public UiTextEntry(string key, string text)
        {
            Key = key;
            Text = text;
        }
    }
}
