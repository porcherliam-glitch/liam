using System.Collections.Generic;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// What the right side of the quest log shows for one quest (filled by <see cref="QuestDetailsBuilder"/>): title,
    /// category and level, description, the current stage text with its objectives ("Aktueller Stand") or the outcome
    /// ("Ausgang"), and the history: earlier stages and the decisions of the ledger.
    /// </summary>
    public sealed class QuestDetails
    {
        /// <summary>Quest id (empty = nothing selected).</summary>
        public string QuestId { get; set; } = string.Empty;

        /// <summary>Title.</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>"Nebenquest · empfohlen ab Stufe 2".</summary>
        public string Meta { get; set; } = string.Empty;

        /// <summary>Description of the quest.</summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>Heading of the current part ("Aktueller Stand", "Ausgang", "Gescheitert").</summary>
        public string CurrentTitle { get; set; } = string.Empty;

        /// <summary>Journal text of the current (or end) stage.</summary>
        public string CurrentText { get; set; } = string.Empty;

        /// <summary>Visible objectives of the active stage (empty for finished quests).</summary>
        public List<QuestObjectiveLine> Objectives { get; } = new List<QuestObjectiveLine>();

        /// <summary>Heading of the history ("Bisher", "Entscheidungen"); empty if there is no history.</summary>
        public string HistoryTitle { get; set; } = string.Empty;

        /// <summary>History lines.</summary>
        public List<QuestDetailLine> History { get; } = new List<QuestDetailLine>();

        /// <summary>True if a quest is shown.</summary>
        public bool HasQuest => QuestId.Length > 0;

        /// <summary>Empties everything.</summary>
        public void Clear()
        {
            QuestId = string.Empty;
            Title = string.Empty;
            Meta = string.Empty;
            Description = string.Empty;
            CurrentTitle = string.Empty;
            CurrentText = string.Empty;
            Objectives.Clear();
            HistoryTitle = string.Empty;
            History.Clear();
        }
    }
}
