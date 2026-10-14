namespace Aetherfall.Core
{
    /// <summary>
    /// Request of <see cref="ISceneLoader.ChangeWorldSpaceAsync"/>: which scene becomes the world space (the active gameplay
    /// scene), the loading screen title and whether the loading screen stays visible afterwards.
    /// </summary>
    public readonly struct WorldSpaceRequest
    {
        /// <summary>Scene key of the new world space (see <see cref="SceneKeys"/>).</summary>
        public readonly string SceneKey;

        /// <summary>Title shown on the loading screen (e.g. "Testgelaende"); empty = generic text.</summary>
        public readonly string Title;

        /// <summary>
        /// True: the loading screen stays visible after the scene is loaded; the caller hides it once the game is placed
        /// (e.g. after loading the save). False: the scene loader hides it at the end.
        /// </summary>
        public readonly bool KeepLoadingScreen;

        /// <summary>Creates the request.</summary>
        /// <param name="sceneKey">Scene key of the new world space.</param>
        /// <param name="title">Loading screen title.</param>
        /// <param name="keepLoadingScreen">True if the caller hides the loading screen itself.</param>
        public WorldSpaceRequest(string sceneKey, string title, bool keepLoadingScreen)
        {
            SceneKey = sceneKey;
            Title = title ?? string.Empty;
            KeepLoadingScreen = keepLoadingScreen;
        }
    }
}
