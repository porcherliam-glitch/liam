using UnityEngine;

namespace Aetherfall.Future
{
    /// <summary>SELF-TEST: uses a Unity 6 API that the harness neither shims nor patches (whitelist "filter").</summary>
    public sealed class Spawner : MonoBehaviour
    {
        [SerializeField] private GameObject prefab;

        private async Awaitable Start()
        {
            var operation = InstantiateAsync(prefab);
            await Awaitable.NextFrameAsync(destroyCancellationToken);
        }
    }
}
