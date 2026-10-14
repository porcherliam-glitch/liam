namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>What the dialogue screen shows (<see cref="IDialogueScreenSource.Mode"/>).</summary>
    public enum DialogueScreenMode
    {
        /// <summary>No conversation (the screen closes).</summary>
        None = 0,

        /// <summary>An NPC line (subtitle).</summary>
        Line = 1,

        /// <summary>The answers of a choice.</summary>
        Choice = 2
    }
}
