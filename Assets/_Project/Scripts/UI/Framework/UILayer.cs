namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// UI layers of architecture 4.9: one UIDocument per layer with the shared panel settings; the value is the sorting order.
    /// </summary>
    public enum UILayer
    {
        /// <summary>HUD (bars, compass, abilities, prompt).</summary>
        Hud = 0,

        /// <summary>Markers projected from the world (enemy bars, quest giver symbols) – later.</summary>
        WorldMarkers = 5,

        /// <summary>Menus: main menu, pause menu, death screen.</summary>
        Screens = 10,

        /// <summary>Confirmation dialogs – later.</summary>
        Modals = 20,

        /// <summary>Messages and the save indicator.</summary>
        Toasts = 30,

        /// <summary>Loading screen.</summary>
        Loading = 40,

        /// <summary>Developer tools.</summary>
        Debug = 50
    }
}
