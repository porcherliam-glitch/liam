// HARNESS ONLY. Unity 2022.2+ member, missing in the 2021.3 reference assemblies.
using System.Threading;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEngine.CoreModule", "UnityEngine.MonoBehaviour")]
    internal abstract class MonoBehaviourPatch
    {
        /// <summary>Cancelled when the MonoBehaviour is destroyed (Unity 2022.2+).</summary>
        public CancellationToken destroyCancellationToken => throw null;
    }
}
