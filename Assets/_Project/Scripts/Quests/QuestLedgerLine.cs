namespace Aetherfall.Quests
{
    /// <summary>One visible line of the decision ledger of a quest (journal tab "Abgeschlossen", GDD 02 6.4).</summary>
    public readonly struct QuestLedgerLine
    {
        /// <summary>Local ledger id.</summary>
        public readonly string Id;

        /// <summary>German text.</summary>
        public readonly string Text;

        /// <summary>True for a consequence ("Folgen bisher").</summary>
        public readonly bool IsConsequence;

        /// <summary>Creates the line.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="text">Text.</param>
        /// <param name="isConsequence">True for a consequence.</param>
        public QuestLedgerLine(string id, string text, bool isConsequence)
        {
            Id = id ?? string.Empty;
            Text = text ?? string.Empty;
            IsConsequence = isConsequence;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return (IsConsequence ? "Folge: " : "· ") + Text;
        }
    }
}
