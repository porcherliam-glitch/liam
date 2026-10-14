namespace Aetherfall.Quests
{
    /// <summary>
    /// How a quest begins (GDD 02, 4.1 proposal "Startausloeser"). Data for the editor, the validator (V11) and the world
    /// objects that start quests; the start itself is the action <c>StartQuest</c> or <see cref="IQuestService.TryStart"/>.
    /// Values are stored in assets: never renumber.
    /// </summary>
    public enum QuestStartTriggerKind
    {
        /// <summary>Not set.</summary>
        None = 0,

        /// <summary>A dialogue starts it (German "Dialog").</summary>
        Dialogue = 1,

        /// <summary>Picking up an item (German "Item aufheben").</summary>
        ItemPickup = 2,

        /// <summary>Entering an area (German "Gebiet betreten").</summary>
        AreaEntered = 3,

        /// <summary>Reading a notice (German "Aushang lesen").</summary>
        NoticeBoard = 4,

        /// <summary>A world event (German "Weltereignis").</summary>
        WorldEvent = 5,

        /// <summary>Automatically, e.g. new game or follow-up (German "automatisch").</summary>
        Automatic = 6
    }
}
