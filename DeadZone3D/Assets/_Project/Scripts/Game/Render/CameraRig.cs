using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Top-down chase camera with look-ahead, zoom and screen shake.</summary>
    public sealed class CameraRig
    {
        public readonly Camera cam;
        private Vector3 _focus;
        private float _shake, _t;
        public float distance = 24f, pitch = 58f, yaw = 0f;
        public float minDistance = 14f, maxDistance = 36f;
        public bool shakeEnabled = true;

        public CameraRig(Camera cam)
        {
            this.cam = cam;
            cam.fieldOfView = 42f;
            cam.nearClipPlane = 0.3f;
            cam.farClipPlane = 260f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.02f, 0.025f, 0.03f);
        }

        public void Snap(Vector3 focus) { _focus = focus; Apply(); }

        public void Zoom(float scroll)
        {
            if (Mathf.Abs(scroll) < 0.01f) return;
            distance = Mathf.Clamp(distance - Mathf.Sign(scroll) * 2f, minDistance, maxDistance);
        }

        public void AddShake(float s) { if (shakeEnabled) _shake = Mathf.Min(1.2f, _shake + s * 0.03f); }

        public void Follow(Vector3 target, float dt, float sharpness = 6f)
        {
            float k = 1f - Mathf.Exp(-sharpness * Mathf.Min(dt, 0.1f));
            _focus = Vector3.Lerp(_focus, target, k);
            _t += dt;
            Apply();
            if (_shake > 0.001f)
            {
                _shake *= Mathf.Exp(-8f * dt);
                cam.transform.position += new Vector3(Mathf.Sin(_t * 91.7f), Mathf.Cos(_t * 63.1f) * 0.5f, Mathf.Cos(_t * 77.3f)) * _shake;
            }
        }

        private void Apply()
        {
            var rot = Quaternion.Euler(pitch, yaw, 0);
            cam.transform.position = _focus - rot * Vector3.forward * distance;
            cam.transform.rotation = rot;
        }

        /// <summary>Point on the horizontal plane y = height under the screen position (pixels, origin bottom-left).</summary>
        public bool ScreenToGround(Vector2 screen, float height, out Vector3 point)
        {
            var ray = cam.ScreenPointToRay(new Vector3(screen.x, screen.y, 0));
            point = default;
            if (Mathf.Abs(ray.direction.y) < 1e-4f) return false;
            float t = (height - ray.origin.y) / ray.direction.y;
            if (t < 0) return false;
            point = ray.origin + ray.direction * t;
            return true;
        }
    }
}
