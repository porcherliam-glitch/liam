// HARNESS ONLY. Client.AddAndRemove (Unity 2021.2+), missing in the UnityEditor.dll (2021.1) reference.
// Signature as in Unity 6000.3.26f1 (Modules/PackageManager/Editor/Managed/Client.cs).
using UnityEditor.PackageManager.Requests;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEditor", "UnityEditor.PackageManager.Client")]
    internal static class PackageManagerClientPatch
    {
        public static AddAndRemoveRequest AddAndRemove(string[] packagesToAdd = null, string[] packagesToRemove = null) => throw null;
    }
}
