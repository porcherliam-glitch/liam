// HARNESS ONLY. Unity 6 renamed Rigidbody.velocity/drag/angularDrag (old names obsolete).
using UnityEngine;

namespace Harness.Unity6Patches
{
    [PatchTarget("UnityEngine.PhysicsModule", "UnityEngine.Rigidbody")]
    internal abstract class RigidbodyPatch
    {
        /// <summary>Linear velocity (Unity 6, replaces velocity).</summary>
        public Vector3 linearVelocity { get => throw null; set => throw null; }

        /// <summary>Linear damping (Unity 6, replaces drag).</summary>
        public float linearDamping { get => throw null; set => throw null; }

        /// <summary>Angular damping (Unity 6, replaces angularDrag).</summary>
        public float angularDamping { get => throw null; set => throw null; }
    }
}
