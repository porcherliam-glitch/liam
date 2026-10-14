namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// One answer as the dialogue screen shows it (plain values, filled by the <see cref="IDialogueScreenSource"/>): symbol
    /// (diamond, "!", star), tag ("[Ueberzeugen 12]"), text, selectable or greyed, chosen before (60 % opacity), hold to
    /// confirm, attribute colour key of a check.
    /// </summary>
    public readonly struct DialogueScreenOption
    {
        /// <summary>Creates an option.</summary>
        /// <param name="text">Answer text without tag.</param>
        /// <param name="tagText">Tag text, e.g. "[Ueberzeugen 12]"; empty if none.</param>
        /// <param name="tag">Kind of the tag.</param>
        /// <param name="symbolText">Quest symbol ("◆", "!", "★") or empty.</param>
        /// <param name="enabled">True if selectable.</param>
        /// <param name="alreadyChosen">True if chosen before.</param>
        /// <param name="requiresHold">True for hold to confirm ("[Toeten]").</param>
        /// <param name="attributeKey">Attribute colour key of a check (<c>charisma</c>, <c>strength</c>); empty otherwise.</param>
        public DialogueScreenOption(string text, string tagText, DialogueScreenTag tag, string symbolText, bool enabled, bool alreadyChosen,
            bool requiresHold, string attributeKey)
        {
            Text = text ?? string.Empty;
            TagText = tagText ?? string.Empty;
            Tag = tag;
            SymbolText = symbolText ?? string.Empty;
            IsEnabled = enabled;
            IsAlreadyChosen = alreadyChosen;
            RequiresHold = requiresHold;
            AttributeKey = attributeKey ?? string.Empty;
        }

        /// <summary>Answer text without tag.</summary>
        public readonly string Text;

        /// <summary>Tag text; empty if none.</summary>
        public readonly string TagText;

        /// <summary>Kind of the tag.</summary>
        public readonly DialogueScreenTag Tag;

        /// <summary>Quest symbol or empty.</summary>
        public readonly string SymbolText;

        /// <summary>True if selectable.</summary>
        public readonly bool IsEnabled;

        /// <summary>True if chosen before.</summary>
        public readonly bool IsAlreadyChosen;

        /// <summary>True for hold to confirm.</summary>
        public readonly bool RequiresHold;

        /// <summary>Attribute colour key of a check; empty otherwise.</summary>
        public readonly string AttributeKey;
    }
}
