using Aetherfall.Core;

namespace Aetherfall.Input
{
    /// <summary>
    /// Pause rules of the "Start / Esc" button (architecture 4.4: "Playing → Paused: Start oder Esc", "Dialogue → Paused:
    /// Start"). Pure logic; <see cref="InputService"/> reads the buttons and applies the command.
    /// </summary>
    /// <remarks>
    /// <para>Pause request = <c>Pause</c> of the Gameplay, Dialog or Riding map. Resume request = <c>CloseHub</c>
    /// (Start / Esc) or <c>Cancel</c> (B / Esc / right mouse button) of the UI map.</para>
    /// <para>This routing is a stand-in until the pause menu exists (UI step): the pause screen will then handle the UI
    /// buttons itself and the routing is switched off in the InputInstaller.</para>
    /// </remarks>
    public static class PauseRouting
    {
        /// <summary>Decides what a pause or resume request does in the current state.</summary>
        /// <param name="current">Current game state (top of the modal stack).</param>
        /// <param name="pauseRequested">A pause button of the active player map was pressed this frame.</param>
        /// <param name="resumeRequested">A close/back button of the UI map was pressed this frame.</param>
        /// <returns>The command; <see cref="PauseCommand.None"/> if the request has no effect in this state.</returns>
        public static PauseCommand Resolve(GameState current, bool pauseRequested, bool resumeRequested)
        {
            if (current == GameState.Paused)
            {
                return resumeRequested ? PauseCommand.PopPaused : PauseCommand.None;
            }

            if (pauseRequested && GameStateTransitions.CanPush(current, GameState.Paused))
            {
                return PauseCommand.PushPaused;
            }

            return PauseCommand.None;
        }
    }
}
