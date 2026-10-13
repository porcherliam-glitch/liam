// HARNESS ONLY. Unity 2022.2+ member, missing in the 2021.3 reference assemblies.
namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEngine.CoreModule", "UnityEngine.SceneManagement.SceneManager")]
    internal static class SceneManagerPatch
    {
        /// <summary>Number of loaded scenes (Unity 2022.2+).</summary>
        public static int loadedSceneCount => throw null;
    }
}
