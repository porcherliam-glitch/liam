namespace Aetherfall.Core
{
    /// <summary>
    /// Scene operations used by <see cref="SceneLoader"/>: <c>SceneManager</c> in the game (<see cref="UnitySceneBackend"/>),
    /// a fake in tests. Keeps the loader itself free of Unity calls.
    /// </summary>
    public interface ISceneBackend
    {
        /// <summary>Real time in seconds (monotonic, not scaled), used for load durations.</summary>
        double RealtimeSeconds { get; }

        /// <summary>True if a scene with this key is loaded (also scenes loaded by someone else).</summary>
        /// <param name="sceneKey">Scene key.</param>
        bool IsLoaded(string sceneKey);

        /// <summary>Starts loading a scene additively.</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <returns>The operation, or null if the scene cannot be loaded (e.g. not in the build profile's scene list).</returns>
        ISceneLoadOperation LoadAdditive(string sceneKey);

        /// <summary>Starts unloading a scene.</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <returns>The operation, or null if the scene is not loaded.</returns>
        ISceneLoadOperation Unload(string sceneKey);

        /// <summary>Makes a loaded scene the active scene (lighting and environment settings come from it).</summary>
        /// <param name="sceneKey">Scene key.</param>
        /// <returns>True on success.</returns>
        bool SetActive(string sceneKey);
    }
}
