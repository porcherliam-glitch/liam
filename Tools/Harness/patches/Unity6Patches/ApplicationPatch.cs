// HARNESS ONLY. Unity 2022.2+ member, missing in the 2021.3 reference assemblies.
using System.Threading;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEngine.CoreModule", "UnityEngine.Application")]
    internal static class ApplicationPatch
    {
        /// <summary>Cancelled when the application or Play Mode exits (Unity 2022.2+).</summary>
        public static CancellationToken exitCancellationToken => throw null;
    }
}
