#if UNITY_EDITOR
using System;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.Core
{
    /// <summary>
    /// Editor-only convenience (architecture 4.1, "Editor-Komfort"): if Play Mode starts in any scene other than the boot
    /// scene, the boot scene (build index 0) is loaded additively, so services exist in test and cell scenes as well.
    /// Compiled only in the editor; builds always start with the boot scene anyway.
    /// </summary>
    /// <remarks>
    /// <para>Timing: runs before the first scene's Awake. Unity finishes the additive load one frame later, so objects of
    /// the started scene run Awake/Start <b>before</b> <see cref="GameBootstrapper"/>. They must not assume that
    /// <see cref="Services.Locator"/> is set and should wait with <c>TryGet</c> (see <c>GameStateDebugOverlay</c>).</para>
    /// <para>Skipped when: the boot scene is already open (e.g. Play Mode started in Boot.unity or Boot is open additively),
    /// the build scene list is empty, or the Unity Test Framework runs Play Mode tests (scene "InitTestScene…").</para>
    /// <para>Later (Phase 1 step 1.10) the player will additionally be spawned at the scene's <c>DevSpawnPoint</c>.</para>
    /// </remarks>
    internal static class EditorBootstrap
    {
        private const int BootSceneBuildIndex = 0;
        private const string TestRunnerScenePrefix = "InitTestScene";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void LoadBootSceneIfMissing()
        {
            if (SceneManager.sceneCountInBuildSettings == 0)
            {
                Log.Warning(LogCategory.Boot, "EditorBootstrap: the build scene list is empty, the boot scene cannot be loaded. " +
                                              "Add Scenes/Boot/Boot.unity as the first scene (File > Build Profiles > Scene List).");
                return;
            }

            string bootScenePath = SceneUtility.GetScenePathByBuildIndex(BootSceneBuildIndex);
            if (string.IsNullOrEmpty(bootScenePath))
            {
                return;
            }

            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                Scene scene = SceneManager.GetSceneAt(i);
                if (scene.path == bootScenePath || scene.buildIndex == BootSceneBuildIndex)
                {
                    return; // Boot scene is already part of this Play Mode session.
                }

                if (scene.name.StartsWith(TestRunnerScenePrefix, StringComparison.Ordinal))
                {
                    return; // Play Mode tests set up their own scenes and services.
                }
            }

            Log.Info(LogCategory.Boot, "EditorBootstrap: Play Mode started in '" + SceneManager.GetActiveScene().name +
                                       "'. Loading boot scene '" + bootScenePath + "' additively.");
            SceneManager.LoadScene(BootSceneBuildIndex, LoadSceneMode.Additive);
        }
    }
}
#endif
