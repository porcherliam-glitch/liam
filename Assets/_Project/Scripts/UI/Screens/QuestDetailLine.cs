namespace Aetherfall.UI.Screens
{
    /// <summary>One line of the history part of the quest details: an earlier stage, a decision or a consequence.</summary>
    public readonly struct QuestDetailLine
    {
        /// <summary>Text.</summary>
        public readonly string Text;

        /// <summary>Kind (style).</summary>
        public readonly QuestDetailLineKind Kind;

        /// <summary>Creates the line.</summary>
        /// <param name="text">Text.</param>
        /// <param name="kind">Kind.</param>
        public QuestDetailLine(string text, QuestDetailLineKind kind)
        {
            Text = text ?? string.Empty;
            Kind = kind;
        }

        /// <summary>USS class of the kind (<c>is-decision</c>, <c>is-consequence</c>) or empty.</summary>
        public string StyleClass => Kind == QuestDetailLineKind.Decision ? "is-decision" : Kind == QuestDetailLineKind.Consequence ? "is-consequence" : string.Empty;

        /// <inheritdoc />
        public override string ToString()
        {
            return Kind + ": " + Text;
        }
    }
}
