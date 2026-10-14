namespace Aetherfall.UI.Screens
{
    /// <summary>One row of the quest list (title, category and level, badge, colour).</summary>
    public readonly struct QuestLogEntry
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Title.</summary>
        public readonly string Title;

        /// <summary>Second line, e.g. "Nebenquest · Stufe 2".</summary>
        public readonly string Info;

        /// <summary>Badge on the right ("Fokus", "Verfolgt", "Abgeschlossen", "Gescheitert") or empty.</summary>
        public readonly string Badge;

        /// <summary>Colour class of the category stripe.</summary>
        public readonly string CategoryClass;

        /// <summary>True if tracked in the HUD.</summary>
        public readonly bool Tracked;

        /// <summary>True for the focus quest.</summary>
        public readonly bool Focus;

        /// <summary>True for completed or failed quests.</summary>
        public readonly bool Finished;

        /// <summary>True for failed quests.</summary>
        public readonly bool Failed;

        /// <summary>Creates the row.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="title">Title.</param>
        /// <param name="info">Second line.</param>
        /// <param name="badge">Badge.</param>
        /// <param name="categoryClass">Colour class.</param>
        /// <param name="tracked">Tracked.</param>
        /// <param name="focus">Focus quest.</param>
        /// <param name="finished">Finished.</param>
        /// <param name="failed">Failed.</param>
        public QuestLogEntry(string questId, string title, string info, string badge, string categoryClass, bool tracked, bool focus, bool finished, bool failed)
        {
            QuestId = questId ?? string.Empty;
            Title = title ?? string.Empty;
            Info = info ?? string.Empty;
            Badge = badge ?? string.Empty;
            CategoryClass = categoryClass ?? string.Empty;
            Tracked = tracked;
            Focus = focus;
            Finished = finished;
            Failed = failed;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Title + " (" + Info + (Badge.Length > 0 ? ", " + Badge : string.Empty) + ")";
        }
    }
}
