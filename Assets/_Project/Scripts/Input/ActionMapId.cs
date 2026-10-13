namespace Aetherfall.Input
{
    /// <summary>
    /// The player action maps of §7.3 (GDD 03 1.5, architecture 11.1). Exactly one of them is enabled at a time
    /// (<see cref="ActionMapTable"/>); <see cref="None"/> means all are disabled (Boot, Loading).
    /// </summary>
    public enum ActionMapId
    {
        /// <summary>No player map is active (boot, loading screens).</summary>
        None = 0,

        /// <summary>On foot in the world: movement, camera, combat, interaction.</summary>
        Gameplay = 1,

        /// <summary>Menus, hub, trading, workbench, pause menu, cutscene skipping.</summary>
        UI = 2,

        /// <summary>Conversations (full and short mode).</summary>
        Dialog = 3,

        /// <summary>Mounted on a riding animal.</summary>
        Riding = 4,

        /// <summary>Building mode in the player's house.</summary>
        Building = 5
    }
}
