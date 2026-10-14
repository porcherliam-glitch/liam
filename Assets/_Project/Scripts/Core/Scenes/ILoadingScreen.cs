namespace Aetherfall.Core
{
    /// <summary>
    /// Loading screen used by <see cref="ISceneLoader"/> (architecture 3.5: interface in Core, implementation in UI.Screens,
    /// registered in the service locator). The scene loader resolves it lazily with <c>TryGet</c>; without one it loads
    /// without a loading screen.
    /// </summary>
    public interface ILoadingScreen
    {
        /// <summary>True while the loading screen is shown.</summary>
        bool IsVisible { get; }

        /// <summary>Shows the loading screen (or updates its title if it is already visible) with progress 0.</summary>
        /// <param name="title">Title, e.g. the name of the area that is loaded. Empty = generic text.</param>
        void Show(string title);

        /// <summary>Sets the progress bar.</summary>
        /// <param name="progress01">Progress from 0 to 1.</param>
        void SetProgress(float progress01);

        /// <summary>Hides the loading screen.</summary>
        void Hide();
    }
}
