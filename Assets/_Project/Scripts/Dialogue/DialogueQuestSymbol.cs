namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Quest symbol in front of an option (GDD 02, 12.4), in the category colour of the quest: star (complete) before "!" (new)
    /// before diamond (progress). The diamond is only shown on options without a bracket tag.
    /// </summary>
    public enum DialogueQuestSymbol
    {
        /// <summary>No symbol.</summary>
        None = 0,

        /// <summary>Diamond: quest progress.</summary>
        Progress = 1,

        /// <summary>"!": a new quest.</summary>
        NewQuest = 2,

        /// <summary>Star: quest completion.</summary>
        Complete = 3
    }
}
