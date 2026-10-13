using UnityEngine;

namespace Aetherfall.Broken
{
    /// <summary>SELF-TEST: deliberately violates several project rules.</summary>
    public sealed class PlayerController : MonoBehaviour
    {
        public float speed = 2f;

        private static int s_spawnCount;

        private Camera _camera;

        private void Awake()
        {
            s_spawnCount++;
            _camera = FindObjectOfType<Camera>();
        }

        private void Update()
        {
            if (Input.GetKey(KeyCode.Space))
            {
                transform.position += Vector3.up * speed;
            }

            bool enabledCamera = _camera?.enabled ?? false;
        }
    }
}
