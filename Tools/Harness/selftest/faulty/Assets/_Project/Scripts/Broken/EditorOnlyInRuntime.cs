using UnityEditor;

namespace Aetherfall.Broken
{
    /// <summary>SELF-TEST: uses UnityEditor without #if UNITY_EDITOR (fails only in the player build).</summary>
    public static class EditorOnlyInRuntime
    {
        /// <summary>True while the editor is in Play Mode.</summary>
        public static bool IsPlaying()
        {
            return EditorApplication.isPlaying;
        }
    }
}
