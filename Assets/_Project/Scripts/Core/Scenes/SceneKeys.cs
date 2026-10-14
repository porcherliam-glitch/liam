using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Rules for scene keys of <see cref="ISceneLoader"/> (pure logic). A key is a scene path ending in <c>.unity</c>, a scene
    /// name, or <c>#n</c> for build index n. Until the Addressables step, keys are paths (architecture 4.5).
    /// </summary>
    public static class SceneKeys
    {
        /// <summary>Prefix of build index keys.</summary>
        public const char BuildIndexPrefix = '#';

        private const string SceneExtension = ".unity";

        /// <summary>True if the key is usable (not empty, no leading or trailing blanks).</summary>
        /// <param name="sceneKey">Key to check.</param>
        public static bool IsValid(string sceneKey)
        {
            if (string.IsNullOrEmpty(sceneKey) || sceneKey.Trim().Length != sceneKey.Length)
            {
                return false;
            }

            return sceneKey[0] != BuildIndexPrefix || TryGetBuildIndex(sceneKey, out _);
        }

        /// <summary>Creates the key of a build index.</summary>
        /// <param name="buildIndex">Build index (0 or more).</param>
        public static string FromBuildIndex(int buildIndex)
        {
            if (buildIndex < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(buildIndex), buildIndex, "Build index must be 0 or more.");
            }

            return BuildIndexPrefix + buildIndex.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>Reads the build index of a <c>#n</c> key.</summary>
        /// <param name="sceneKey">Key.</param>
        /// <param name="buildIndex">Build index, or -1.</param>
        /// <returns>True for a valid <c>#n</c> key.</returns>
        public static bool TryGetBuildIndex(string sceneKey, out int buildIndex)
        {
            buildIndex = -1;
            if (string.IsNullOrEmpty(sceneKey) || sceneKey.Length < 2 || sceneKey[0] != BuildIndexPrefix)
            {
                return false;
            }

            int value = 0;
            for (int i = 1; i < sceneKey.Length; i++)
            {
                char c = sceneKey[i];
                if (c < '0' || c > '9' || value > 100000)
                {
                    return false;
                }

                value = value * 10 + (c - '0');
            }

            buildIndex = value;
            return true;
        }

        /// <summary>True if the key is a scene path (contains a slash or ends with <c>.unity</c>).</summary>
        /// <param name="sceneKey">Key.</param>
        public static bool IsPath(string sceneKey)
        {
            return !string.IsNullOrEmpty(sceneKey) &&
                   (sceneKey.IndexOf('/') >= 0 || sceneKey.EndsWith(SceneExtension, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>Scene name of a key: the file name without <c>.unity</c> for paths, the key itself otherwise.</summary>
        /// <param name="sceneKey">Key.</param>
        public static string DisplayName(string sceneKey)
        {
            if (string.IsNullOrEmpty(sceneKey))
            {
                return string.Empty;
            }

            string name = sceneKey;
            int slash = name.LastIndexOf('/');
            if (slash >= 0)
            {
                name = name.Substring(slash + 1);
            }

            if (name.EndsWith(SceneExtension, StringComparison.OrdinalIgnoreCase))
            {
                name = name.Substring(0, name.Length - SceneExtension.Length);
            }

            return name;
        }

        /// <summary>
        /// Maps Unity's load progress (0 to 0.9 while loading, 1 after activation) to 0..1.
        /// </summary>
        /// <param name="unityProgress">Progress reported by the operation.</param>
        public static float NormalizeProgress(float unityProgress)
        {
            if (float.IsNaN(unityProgress) || unityProgress <= 0f)
            {
                return 0f;
            }

            float value = unityProgress / 0.9f;
            return value >= 1f ? 1f : value;
        }

        /// <summary>Maps the progress of one phase of several equally long phases to the overall progress.</summary>
        /// <param name="phase">Index of the running phase (0-based).</param>
        /// <param name="phaseCount">Number of phases (1 or more).</param>
        /// <param name="phaseProgress01">Progress of the running phase from 0 to 1.</param>
        public static float CombinePhases(int phase, int phaseCount, float phaseProgress01)
        {
            if (phaseCount < 1)
            {
                return 1f;
            }

            float clamped = float.IsNaN(phaseProgress01) ? 0f : Math.Max(0f, Math.Min(1f, phaseProgress01));
            int index = Math.Max(0, Math.Min(phaseCount - 1, phase));
            return (index + clamped) / phaseCount;
        }
    }
}
