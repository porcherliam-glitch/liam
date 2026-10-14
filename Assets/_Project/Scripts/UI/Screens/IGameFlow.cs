using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The menu actions that change the game session: new game, continue, load, quick save, back to the main menu, respawn,
    /// quit. Combines game state (architecture 4.4), scene loader (4.5) and save manager (4.7).
    /// </summary>
    /// <remarks>
    /// Lives in UI.Screens until the world system takes over the session flow (load order of architecture 9.2); until there
    /// are real world scenes, "Neues Spiel" and "Laden" load the test ground.
    /// </remarks>
    public interface IGameFlow
    {
        /// <summary>True while a flow (new game, load, back to the main menu) runs; menus ignore further actions.</summary>
        bool IsBusy { get; }

        /// <summary>Raised with a German message when an action failed (shown by the menus).</summary>
        event Action<string> Failed;

        /// <summary>The newest loadable save of the current character ("Fortsetzen", GDD 05 5.1).</summary>
        /// <param name="slot">Slot or null.</param>
        bool TryGetLatestSave(out SaveSlotInfo slot);

        /// <summary>All saves of the current character, newest first (reads the header files).</summary>
        IReadOnlyList<SaveSlotInfo> ListSaves();

        /// <summary>Main menu: MainMenu → Loading, load the gameplay scene, new game, → Playing.</summary>
        void StartNewGame();

        /// <summary>Main menu: loads the newest save.</summary>
        void ContinueLatest();

        /// <summary>Loads a save: from the main menu with the gameplay scene, in the game (pause, death screen) in place.</summary>
        /// <param name="slotId">Slot id, e.g. <c>char_01/quick_0</c>.</param>
        void LoadSlot(string slotId);

        /// <summary>Quick save (pause menu, GDD 05 5.4).</summary>
        /// <param name="completed">Called with the result (also if refused).</param>
        void QuickSave(Action<SaveResult> completed);

        /// <summary>Pause → main menu: Paused → MainMenu and unload the gameplay scene.</summary>
        void ReturnToMainMenu();

        /// <summary>Death screen: back to Playing and respawn at the spawn point.</summary>
        void RespawnAtSpawnPoint();

        /// <summary>Ends the game (in the editor: stops Play Mode).</summary>
        void QuitGame();
    }
}
