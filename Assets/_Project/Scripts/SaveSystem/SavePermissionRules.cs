using Aetherfall.Core;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Column "Speichern erlaubt" of architecture table 4.4 (used by <see cref="ISaveManager.IsSaveAllowed"/>, 9.8):
    /// allowed in Playing, Menu, Paused and Building; not in Boot, Loading, MainMenu (no game running), Dialogue and
    /// Cutscene (running dialogue graphs and timelines are not saved, GDD 05 5.2).
    /// </summary>
    public static class SavePermissionRules
    {
        /// <summary>True if the game state allows saving.</summary>
        /// <param name="state">Current game state (top of the modal stack).</param>
        public static bool IsSaveAllowedInState(GameState state)
        {
            switch (state)
            {
                case GameState.Playing:
                case GameState.Menu:
                case GameState.Paused:
                case GameState.Building:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>True if a load may start from this state (the game state service allows the switch to Loading).</summary>
        /// <param name="state">Current game state.</param>
        public static bool CanStartLoad(GameState state)
        {
            return state == GameState.Loading || GameStateTransitions.CanSwitchBase(state, GameState.Loading);
        }
    }
}
