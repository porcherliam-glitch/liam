namespace Aetherfall.Dialogue
{
    /// <summary>What the dialogue screen shows right now (<see cref="DialogueView.State"/>).</summary>
    public enum DialogueViewState
    {
        /// <summary>No conversation is running.</summary>
        None = 0,

        /// <summary>A line is shown; the player continues with confirm.</summary>
        Line = 1,

        /// <summary>The answers of a choice are shown.</summary>
        Choice = 2,

        /// <summary>The conversation just ended (exit known); the screen closes.</summary>
        Ended = 3
    }
}
