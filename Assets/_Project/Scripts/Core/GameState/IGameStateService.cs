namespace Aetherfall.Core
{
    /// <summary>
    /// Global game state: a base state plus a stack of modal states over <see cref="GameState.Playing"/> (architecture 4.4).
    /// Every successful change publishes <see cref="GameStateChanged"/> and applies the time scale of the new state.
    /// Rejected requests return false, change nothing and log a warning.
    /// </summary>
    public interface IGameStateService
    {
        /// <summary>Current state: the top of the modal stack, or the base state if the stack is empty.</summary>
        GameState Current { get; }

        /// <summary>Current base state (Boot, MainMenu, Loading or Playing).</summary>
        GameState BaseState { get; }

        /// <summary>Number of modal states on the stack (0 = none). Read-only view for debug tools.</summary>
        int ModalCount { get; }

        /// <summary>Returns a modal state of the stack; index 0 is the lowest (oldest) entry.</summary>
        /// <param name="index">0 to <see cref="ModalCount"/> - 1.</param>
        /// <exception cref="System.ArgumentOutOfRangeException"><paramref name="index"/> is out of range.</exception>
        GameState GetModalAt(int index);

        /// <summary>Switches the base state and clears the modal stack (see <see cref="GameStateTransitions.CanSwitchBase"/>).</summary>
        /// <param name="state">Boot, MainMenu, Loading or Playing.</param>
        /// <param name="reason">Short reason for the log, e.g. "Boot completed".</param>
        /// <returns>True if the switch was allowed and performed.</returns>
        bool SwitchBase(GameState state, string reason);

        /// <summary>
        /// Pushes a modal state if the transition table allows it (see <see cref="GameStateTransitions.TryGetPushMode"/>).
        /// Note: pushing <see cref="GameState.Cutscene"/> while in <see cref="GameState.Dialogue"/> replaces the dialogue.
        /// </summary>
        /// <param name="modal">Menu, Paused, Dialogue, Cutscene or Building.</param>
        /// <param name="reason">Short reason for the log.</param>
        /// <returns>True if the push was allowed and performed.</returns>
        bool Push(GameState modal, string reason);

        /// <summary>Pops the top modal state, but only if it equals <paramref name="expectedTop"/> (protects against wrong order).</summary>
        /// <param name="expectedTop">The modal state the caller opened itself.</param>
        /// <returns>True if the top matched and was removed.</returns>
        bool Pop(GameState expectedTop);
    }
}
