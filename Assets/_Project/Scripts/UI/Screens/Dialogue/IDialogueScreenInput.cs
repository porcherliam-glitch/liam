namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Supplies the dialogue input of a frame (action map "Dialog", enabled by the input service in the game state
    /// <c>Dialogue</c>, architecture 4.4). Implemented in the integration step on top of the Dialog map (guide 10, section
    /// "Integration"); a fake in tests. Keeps the screen free of Input System types.
    /// </summary>
    public interface IDialogueScreenInput
    {
        /// <summary>True while the Dialog map is enabled (false below the pause menu).</summary>
        bool IsActive { get; }

        /// <summary>Fills the input of this frame.</summary>
        /// <param name="frame">Frame to fill (cleared by the caller).</param>
        void Read(ref DialogueInputFrame frame);
    }
}
