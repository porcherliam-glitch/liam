namespace Aetherfall.Core
{
    /// <summary>How an allowed <see cref="IGameStateService.Push"/> changes the modal stack.</summary>
    public enum ModalPushMode
    {
        /// <summary>The modal state is placed on top of the current state; Pop returns to it.</summary>
        Stack = 0,

        /// <summary>
        /// The modal state replaces the current top modal state. Used for Dialogue → Cutscene:
        /// the conversation ends and the cutscene returns to Playing (architecture 4.4 diagram).
        /// </summary>
        ReplaceTop = 1
    }
}
