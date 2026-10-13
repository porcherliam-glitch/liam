// HARNESS ONLY. Members missing in the UnityEditor.dll (2021.1) reference.
using UnityEditor;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEditor", "UnityEditor.AssetDatabase")]
    internal static class AssetDatabasePatch
    {
        public static void SaveAssetIfDirty(GUID guid) => throw null;

        public static void SaveAssetIfDirty(UnityEngine.Object obj) => throw null;
    }
}
