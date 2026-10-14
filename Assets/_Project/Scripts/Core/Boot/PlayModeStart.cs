using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Where Play Mode started (editor only): set by <c>EditorBootstrap</c> when Play Mode starts in a scene other than the
    /// boot scene and the boot scene is loaded additively. Test scenes use it to start playing directly
    /// (<c>DevPlayStarter</c>), while a normal start in the boot scene shows the main menu. Always false in builds.
    /// </summary>
    /// <remarks>Domain Reload is disabled: the state is reset at the start of every Play Mode session.</remarks>
    public static class PlayModeStart
    {
        /// <summary>True if Play Mode started in another scene than the boot scene (editor only).</summary>
        public static bool StartedOutsideBootScene { get; private set; }

        /// <summary>Path of the scene Play Mode started in (empty in builds and when started in the boot scene).</summary>
        public static string StartScenePath { get; private set; } = string.Empty;

        /// <summary>True if Play Mode started directly in the scene with this path.</summary>
        /// <param name="scenePath">Scene path, e.g. <c>gameObject.scene.path</c>.</param>
        public static bool IsDirectStartOf(string scenePath)
        {
            return StartedOutsideBootScene && !string.IsNullOrEmpty(scenePath) &&
                   string.Equals(StartScenePath, scenePath, StringComparison.Ordinal);
        }

        /// <summary>Records the start scene (called by EditorBootstrap before the first scene loads).</summary>
        /// <param name="scenePath">Path of the start scene.</param>
        internal static void RecordDirectStart(string scenePath)
        {
            StartedOutsideBootScene = true;
            StartScenePath = scenePath ?? string.Empty;
        }

        /// <summary>Clears the record (Play Mode start, tests).</summary>
        internal static void Reset()
        {
            StartedOutsideBootScene = false;
            StartScenePath = string.Empty;
        }

        [UnityEngine.RuntimeInitializeOnLoadMethod(UnityEngine.RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            Reset();
        }
    }
}
