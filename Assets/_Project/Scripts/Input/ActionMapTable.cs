using Aetherfall.Core;

namespace Aetherfall.Input
{
    /// <summary>
    /// Which action map is active in which game state – table 4.4 of the architecture and "Wann welche Map aktiv ist"
    /// in GDD 03 1.5. Pure logic without Input System calls, so it is testable without the package.
    /// </summary>
    /// <remarks>
    /// <list type="table">
    /// <listheader><term>Game state</term><description>Map</description></listheader>
    /// <item><term>Boot, Loading</term><description>none</description></item>
    /// <item><term>MainMenu, Menu, Paused</term><description>UI</description></item>
    /// <item><term>Playing on foot / mounted</term><description>Gameplay / Riding</description></item>
    /// <item><term>Dialogue (full and short mode)</term><description>Dialog</description></item>
    /// <item><term>Cutscene</term><description>UI (only <c>SkipCutscene</c> held reacts, through the cutscene screen)</description></item>
    /// <item><term>Building</term><description>Building</description></item>
    /// </list>
    /// In Cutscene the UI map stays on, but only the cutscene screen reads it: <c>SkipCutscene</c> held skips, Cancel and
    /// CloseHub are ignored and there is no pause in Stufe A (S58).
    /// TODO (UI step): in the short dialogue mode <c>Move</c> stays active in addition; while the furniture catalog is open
    /// in building mode the UI map replaces Building; the Debug map of development builds comes with the debug console.
    /// </remarks>
    public static class ActionMapTable
    {
        /// <summary>Returns the action map for a game state.</summary>
        /// <param name="state">Current game state (top of the modal stack or the base state).</param>
        /// <param name="controlMode">Control mode of the player; only relevant in <see cref="GameState.Playing"/>.</param>
        /// <returns>The map to enable; <see cref="ActionMapId.None"/> disables all maps.</returns>
        public static ActionMapId For(GameState state, PlayerControlMode controlMode)
        {
            switch (state)
            {
                case GameState.Boot:
                case GameState.Loading:
                    return ActionMapId.None;
                case GameState.MainMenu:
                case GameState.Menu:
                case GameState.Paused:
                case GameState.Cutscene:
                    return ActionMapId.UI;
                case GameState.Playing:
                    return controlMode == PlayerControlMode.Mounted ? ActionMapId.Riding : ActionMapId.Gameplay;
                case GameState.Dialogue:
                    return ActionMapId.Dialog;
                case GameState.Building:
                    return ActionMapId.Building;
                default:
                    return ActionMapId.None;
            }
        }
    }
}
