namespace Aetherfall.Core
{
    /// <summary>
    /// Columns of architecture table 4.4 that several systems need without knowing each other (pure logic).
    /// The column "Speichern erlaubt" belongs to the save system (<c>Aetherfall.SaveSystem.SavePermissionRules</c>).
    /// </summary>
    public static class GameStateRules
    {
        /// <summary>
        /// True if the playtime counter runs in <paramref name="state"/> (table 4.4, column "Spielzeit-Zaehler"):
        /// Playing, Menu, Dialogue, Cutscene and Building count; Boot, MainMenu, Loading and Paused do not.
        /// </summary>
        /// <param name="state">Current game state (top of the modal stack).</param>
        public static bool IsPlaytimeRunning(GameState state)
        {
            return IsPlaytimeState(state);
        }

        /// <summary>
        /// True if the game clock (time of day) runs in <paramref name="state"/> (table 4.4, column "Spieluhr"): only while
        /// playing (Playing, Building); menus, pauses, full dialogues, cutscenes and loading stop it.
        /// </summary>
        /// <param name="state">Current game state (top of the modal stack).</param>
        public static bool IsGameClockRunning(GameState state)
        {
            return state == GameState.Playing || state == GameState.Building;
        }

        private static bool IsPlaytimeState(GameState state)
        {
            switch (state)
            {
                case GameState.Playing:
                case GameState.Menu:
                case GameState.Dialogue:
                case GameState.Cutscene:
                case GameState.Building:
                    return true;
                default:
                    return false;
            }
        }
    }
}
