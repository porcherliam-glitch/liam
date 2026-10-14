namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// A screen that can show an error line (e.g. "Laden fehlgeschlagen: …"). <see cref="UiStateDirector"/> sends failures of
    /// the game flow to the open screen through this interface; implemented by the main menu, the pause menu and the death
    /// screen, a fake in tests.
    /// </summary>
    public interface IErrorDisplay
    {
        /// <summary>Shows an error line on the screen.</summary>
        /// <param name="message">German text; empty hides the line.</param>
        void ShowError(string message);
    }
}
