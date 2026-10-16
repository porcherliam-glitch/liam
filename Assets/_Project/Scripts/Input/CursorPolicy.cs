using Aetherfall.Core;

namespace Aetherfall.Input
{
    /// <summary>
    /// When the mouse cursor is locked and hidden: while the player controls the character (<see cref="GameState.Playing"/>)
    /// and during cutscenes (<see cref="GameState.Cutscene"/>, there is nothing to click; S58). Every menu, the pause menu,
    /// dialogues and the building mode get a free, visible cursor. Pure logic; applied by <see cref="ICursorController"/>.
    /// </summary>
    public static class CursorPolicy
    {
        /// <summary>True if the cursor is locked to the window centre and hidden in this state.</summary>
        /// <param name="state">Current game state.</param>
        public static bool ShouldLockCursor(GameState state)
        {
            return state == GameState.Playing || state == GameState.Cutscene;
        }
    }
}
