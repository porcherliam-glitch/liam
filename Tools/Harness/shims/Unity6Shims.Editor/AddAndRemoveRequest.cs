// HARNESS ONLY - stand-in for UnityEditor.PackageManager.Requests.AddAndRemoveRequest (Unity 2021.2+ / 6000.x).
// In 6000.3 it derives from Request<PackageCollection>; only the members used by project code are declared here.
namespace UnityEditor.PackageManager.Requests
{
    /// <summary>Harness stand-in.</summary>
    public sealed class AddAndRemoveRequest
    {
        /// <summary>See Unity.</summary>
        public bool IsCompleted => throw new System.NotSupportedException();
        /// <summary>See Unity.</summary>
        public StatusCode Status => throw new System.NotSupportedException();
        /// <summary>See Unity.</summary>
        public Error Error => throw new System.NotSupportedException();
        /// <summary>See Unity.</summary>
        public PackageCollection Result => throw new System.NotSupportedException();
    }
}
