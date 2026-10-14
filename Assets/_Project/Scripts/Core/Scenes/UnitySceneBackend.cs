using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.Core
{
    /// <summary>
    /// <see cref="ISceneBackend"/> on top of <see cref="SceneManager"/>: additive loading by scene path, scene name or build
    /// index (<see cref="SceneKeys"/>). The scene must be in the scene list of the build profile.
    /// </summary>
    public sealed class UnitySceneBackend : ISceneBackend
    {
        /// <inheritdoc />
        public double RealtimeSeconds => Time.realtimeSinceStartupAsDouble;

        /// <inheritdoc />
        public bool IsLoaded(string sceneKey)
        {
            Scene scene = Resolve(sceneKey);
            return scene.IsValid() && scene.isLoaded;
        }

        /// <inheritdoc />
        public ISceneLoadOperation LoadAdditive(string sceneKey)
        {
            AsyncOperation operation;
            if (SceneKeys.TryGetBuildIndex(sceneKey, out int buildIndex))
            {
                if (buildIndex >= SceneManager.sceneCountInBuildSettings)
                {
                    return null;
                }

                operation = SceneManager.LoadSceneAsync(buildIndex, LoadSceneMode.Additive);
            }
            else
            {
                if (SceneKeys.IsPath(sceneKey) && SceneUtility.GetBuildIndexByScenePath(sceneKey) < 0)
                {
                    return null;
                }

                operation = SceneManager.LoadSceneAsync(sceneKey, LoadSceneMode.Additive);
            }

            return operation != null ? new UnitySceneLoadOperation(operation) : null;
        }

        /// <inheritdoc />
        public ISceneLoadOperation Unload(string sceneKey)
        {
            Scene scene = Resolve(sceneKey);
            if (!scene.IsValid() || !scene.isLoaded)
            {
                return null;
            }

            AsyncOperation operation = SceneManager.UnloadSceneAsync(scene);
            return operation != null ? new UnitySceneLoadOperation(operation) : null;
        }

        /// <inheritdoc />
        public bool SetActive(string sceneKey)
        {
            Scene scene = Resolve(sceneKey);
            return scene.IsValid() && scene.isLoaded && SceneManager.SetActiveScene(scene);
        }

        private static Scene Resolve(string sceneKey)
        {
            if (SceneKeys.TryGetBuildIndex(sceneKey, out int buildIndex))
            {
                return buildIndex < SceneManager.sceneCountInBuildSettings ? SceneManager.GetSceneByBuildIndex(buildIndex) : default;
            }

            return SceneKeys.IsPath(sceneKey) ? SceneManager.GetSceneByPath(sceneKey) : SceneManager.GetSceneByName(sceneKey);
        }
    }
}
