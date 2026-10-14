namespace Aetherfall.Quests
{
    /// <summary>
    /// Implemented by quest conditions and actions that point into quest data (quest, stage, objective, ledger entry), so the
    /// <see cref="QuestValidator"/> can check these references (V04) without knowing every type.
    /// </summary>
    public interface IQuestDataReference
    {
        /// <summary>Referenced quest; empty = the quest that holds the data ("own quest").</summary>
        string ReferencedQuestId { get; }

        /// <summary>Referenced stage or empty.</summary>
        string ReferencedStageId { get; }

        /// <summary>Referenced objective or empty.</summary>
        string ReferencedObjectiveId { get; }

        /// <summary>Referenced ledger entry or empty.</summary>
        string ReferencedLedgerId { get; }
    }
}
