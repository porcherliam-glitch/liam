// HARNESS ONLY. Unity 2022.1+ member, missing in the UnityEditor.dll (2021.1) reference.
namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEditor", "UnityEditor.SerializedProperty")]
    internal abstract class SerializedPropertyPatch
    {
        /// <summary>Value of the property as object (Unity 2022.1+).</summary>
        public object boxedValue { get => throw null; set => throw null; }
    }
}
