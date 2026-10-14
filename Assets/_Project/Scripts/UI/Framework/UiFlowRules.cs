using Aetherfall.Core;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Which UI parts belong to which game state (architecture 4.4, GDD 05 1.2 and 1.7). Pure logic.
    /// </summary>
    public static class UiFlowRules
    {
        /// <summary>
        /// True if the HUD layer is visible: in the game and behind its modal screens (pause, menus, building), not in the
        /// boot, main menu, loading and cutscene states.
        /// </summary>
        /// <param name="state">Current game state.</param>
        public static bool ShowsHud(GameState state)
        {
            switch (state)
            {
                case GameState.Playing:
                case GameState.Paused:
                case GameState.Menu:
                case GameState.Dialogue:
                case GameState.Building:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>
        /// True if new messages wait instead of appearing (GDD 05 1.7: buffered in dialogue, cutscene and menus; also while
        /// loading and outside the game).
        /// </summary>
        /// <param name="state">Current game state.</param>
        public static bool SuppressesNotifications(GameState state)
        {
            return state != GameState.Playing && state != GameState.Building;
        }
    }
}
