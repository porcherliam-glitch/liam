#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.Core
{
    /// <summary>
    /// Editor-only convenience (architecture 4.1, "Editor-Komfort"): if Play Mode starts in any scene other than the boot
    /// scene, the boot scene (<see cref="BootScenePath"/>) is loaded additively, so services exist in test and cell scenes
    /// as well. Compiled only in the editor; builds always start with the boot scene anyway.
    /// </summary>
    /// <remarks>
    /// <para>Timing: runs before the first scene's Awake. Unity finishes the additive load one frame later, so objects of
    /// the started scene run Awake/Start <b>before</b> <see cref="GameBootstrapper"/>. They must not assume that
    /// <see cref="Services.Locator"/> is set and should wait with <c>TryGet</c> (see <c>GameStateDebugOverlay</c>).</para>
    /// <para>The boot scene is identified by its fixed path, not by build index 0: in the editor the scene list also
    /// contains the scene that was open when Play Mode started (with an empty list it would be index 0 itself). It is
    /// loaded with <see cref="EditorSceneManager.LoadSceneInPlayMode"/>, which works without an entry in the scene list.
    /// If Boot.unity is not the first scene of the scene list, a warning names the menu to fix it (builds need it there).</para>
    /// <para>Skipped when: the boot scene is already open (e.g. Play Mode started in Boot.unity or Boot is open additively),
    /// the boot scene asset does not exist (warning), or the Unity Test Framework runs Play Mode tests (scene "InitTestScene…").</para>
    /// <para>Later (Phase 1 step 1.10) the player will additionally be spawned at the scene's <c>DevSpawnPoint</c>.</para>
    /// </remarks>
    internal static class EditorBootstrap
    {
        /// <summary>Path of the boot scene (architecture 4.1; created by the project setup, step e).</summary>
        internal const string BootScenePath = "Assets/_Project/Scenes/Boot/Boot.unity";

        private const string TestRunnerScenePrefix = "InitTestScene";
        private const string SceneListMenu = "File > Build Profiles > Scene List";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void LoadBootSceneIfMissing()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                Scene scene = SceneManager.GetSceneAt(i);
                if (string.Equals(scene.path, BootScenePath, StringComparison.Ordinal))
                {
                    return; // Boot scene is already part of this Play Mode session.
                }

                if (scene.name.StartsWith(TestRunnerScenePrefix, StringComparison.Ordinal))
                {
                    return; // Play Mode tests set up their own scenes and services.
                }
            }

            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(BootScenePath) == null)
            {
                Log.Warning(LogCategory.Boot, "EditorBootstrap: the boot scene '" + BootScenePath + "' does not exist, so no services are started. " +
                                              "Create it with Aetherfall > Projekt-Setup … (step e).");
                return;
            }

            if (!IsFirstSceneInSceneList())
            {
                Log.Warning(LogCategory.Boot, "EditorBootstrap: '" + BootScenePath + "' is not the first enabled scene of the scene list. " +
                                              "It is loaded anyway, but builds would not start with it. Fix it in " + SceneListMenu +
                                              " (or run step e of Aetherfall > Projekt-Setup …).");
            }

            Log.Info(LogCategory.Boot, "EditorBootstrap: Play Mode started in '" + SceneManager.GetActiveScene().name +
                                       "'. Loading boot scene '" + BootScenePath + "' additively.");
            EditorSceneManager.LoadSceneInPlayMode(BootScenePath, new LoadSceneParameters(LoadSceneMode.Additive));
        }

        private static bool IsFirstSceneInSceneList()
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            for (int i = 0; i < scenes.Length; i++)
            {
                if (!scenes[i].enabled)
                {
                    continue;
                }

                // The first enabled entry gets build index 0.
                return string.Equals(scenes[i].path, BootScenePath, StringComparison.Ordinal);
            }

            return false;
        }
    }
}
#endif
