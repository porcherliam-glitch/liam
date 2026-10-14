namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The current game day for random nodes and dice checks (architecture 11.8: seed = hash of NPC and game day, so reloading
    /// does not change the roll). Implemented later by the game clock (GameTime has no day counter yet); without it every roll
    /// depends only on NPC, dialogue and node.
    /// </summary>
    public interface IDialogueCalendar
    {
        /// <summary>Current game day (0 = first day).</summary>
        int CurrentDay { get; }
    }
}
