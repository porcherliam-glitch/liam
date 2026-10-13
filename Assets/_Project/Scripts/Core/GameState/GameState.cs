namespace Aetherfall.Core
{
    /// <summary>
    /// Global game states (architecture 4.4). <see cref="Boot"/>, <see cref="MainMenu"/>, <see cref="Loading"/> and
    /// <see cref="Playing"/> are base states; the others are modal states stacked over <see cref="Playing"/>.
    /// Values may be serialized; never renumber them.
    /// </summary>
    public enum GameState
    {
        /// <summary>Base state: services are being created and initialized.</summary>
        Boot = 0,

        /// <summary>Base state: main menu.</summary>
        MainMenu = 1,

        /// <summary>Base state: loading a save, a dungeon or a fast-travel target.</summary>
        Loading = 2,

        /// <summary>Base state: the player is in the world.</summary>
        Playing = 3,

        /// <summary>Modal: hub menus such as inventory, map, quest log (time scale 0).</summary>
        Menu = 4,

        /// <summary>Modal: pause menu (time scale 0). Can also lie over <see cref="Dialogue"/>.</summary>
        Paused = 5,

        /// <summary>Modal: conversation with an NPC.</summary>
        Dialogue = 6,

        /// <summary>Modal: cutscene (Timeline).</summary>
        Cutscene = 7,

        /// <summary>Modal: building mode in the player's house.</summary>
        Building = 8
    }
}
