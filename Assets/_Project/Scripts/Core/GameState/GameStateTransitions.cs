namespace Aetherfall.Core
{
    /// <summary>
    /// Transition table of the game state machine, exactly as in the state diagram of architecture 4.4.
    /// Pure logic without Unity calls. All rules are keyed on the <b>current</b> state (top of the modal stack,
    /// or the base state if the stack is empty).
    /// </summary>
    /// <remarks>
    /// <para><b>SwitchBase</b> (base states, clears the modal stack):</para>
    /// <list type="bullet">
    /// <item>Boot → MainMenu (services ready)</item>
    /// <item>MainMenu → Loading (new game or load)</item>
    /// <item>Loading → Playing (cells active, player placed)</item>
    /// <item>Playing → Loading (dungeon, fast travel, load) – only without an open modal</item>
    /// <item>Paused → Loading (load from the pause menu)</item>
    /// <item>Paused → MainMenu (back to the main menu)</item>
    /// </list>
    /// <para><b>Push</b> (modal states):</para>
    /// <list type="bullet">
    /// <item>Playing → Menu, Paused, Dialogue, Cutscene, Building (stacked over Playing)</item>
    /// <item>Dialogue → Paused (stacked over Dialogue; Pop returns to Dialogue)</item>
    /// <item>Dialogue → Cutscene (<see cref="ModalPushMode.ReplaceTop"/>: the dialogue ends, the cutscene returns to Playing)</item>
    /// </list>
    /// <para><b>Pop</b> reveals the state below: Menu/Paused/Dialogue/Cutscene/Building → Playing, Paused → Dialogue.</para>
    /// </remarks>
    public static class GameStateTransitions
    {
        /// <summary>True for Boot, MainMenu, Loading and Playing.</summary>
        /// <param name="state">State to check.</param>
        public static bool IsBaseState(GameState state)
        {
            return state == GameState.Boot || state == GameState.MainMenu || state == GameState.Loading || state == GameState.Playing;
        }

        /// <summary>True for Menu, Paused, Dialogue, Cutscene and Building.</summary>
        /// <param name="state">State to check.</param>
        public static bool IsModalState(GameState state)
        {
            return state == GameState.Menu || state == GameState.Paused || state == GameState.Dialogue ||
                   state == GameState.Cutscene || state == GameState.Building;
        }

        /// <summary>True if <c>SwitchBase(target)</c> is allowed while <paramref name="current"/> is the current state.</summary>
        /// <param name="current">Current state (top of the modal stack or base state).</param>
        /// <param name="target">Requested base state.</param>
        public static bool CanSwitchBase(GameState current, GameState target)
        {
            switch (current)
            {
                case GameState.Boot:
                    return target == GameState.MainMenu;
                case GameState.MainMenu:
                    return target == GameState.Loading;
                case GameState.Loading:
                    return target == GameState.Playing;
                case GameState.Playing:
                    return target == GameState.Loading;
                case GameState.Paused:
                    return target == GameState.Loading || target == GameState.MainMenu;
                default:
                    return false;
            }
        }

        /// <summary>Returns whether <c>Push(modal)</c> is allowed and how it changes the stack.</summary>
        /// <param name="current">Current state (top of the modal stack or base state).</param>
        /// <param name="modal">Requested modal state.</param>
        /// <param name="mode">Stack or replace the top; undefined if the push is not allowed.</param>
        /// <returns>True if the push is allowed.</returns>
        public static bool TryGetPushMode(GameState current, GameState modal, out ModalPushMode mode)
        {
            mode = ModalPushMode.Stack;
            switch (current)
            {
                case GameState.Playing:
                    return IsModalState(modal);
                case GameState.Dialogue:
                    if (modal == GameState.Paused)
                    {
                        return true;
                    }

                    if (modal == GameState.Cutscene)
                    {
                        mode = ModalPushMode.ReplaceTop;
                        return true;
                    }

                    return false;
                default:
                    return false;
            }
        }

        /// <summary>True if <c>Push(modal)</c> is allowed while <paramref name="current"/> is the current state.</summary>
        /// <param name="current">Current state (top of the modal stack or base state).</param>
        /// <param name="modal">Requested modal state.</param>
        public static bool CanPush(GameState current, GameState modal)
        {
            return TryGetPushMode(current, modal, out _);
        }

        /// <summary>
        /// True if popping <paramref name="top"/> may reveal <paramref name="revealed"/> (the "back" edges of the diagram).
        /// With the push rules above this always holds; <see cref="GameStateService"/> checks it as a safety net.
        /// </summary>
        /// <param name="top">Modal state being popped.</param>
        /// <param name="revealed">State that becomes current after the pop.</param>
        public static bool IsValidPopTarget(GameState top, GameState revealed)
        {
            switch (top)
            {
                case GameState.Menu:
                case GameState.Dialogue:
                case GameState.Cutscene:
                case GameState.Building:
                    return revealed == GameState.Playing;
                case GameState.Paused:
                    return revealed == GameState.Playing || revealed == GameState.Dialogue;
                default:
                    return false;
            }
        }
    }
}
