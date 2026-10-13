// HARNESS ONLY. Enum values added in Unity 2021.2+ (names as in Unity 6000.3).
namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEditor", "UnityEditor.ApiCompatibilityLevel")]
    internal enum ApiCompatibilityLevelPatch
    {
        /// <summary>.NET Standard (2.1 in Unity 6), same value as NET_Standard_2_0.</summary>
        NET_Standard = 6,

        /// <summary>.NET Framework, same value as NET_4_6.</summary>
        NET_Unity_4_8 = 3,
    }
}
