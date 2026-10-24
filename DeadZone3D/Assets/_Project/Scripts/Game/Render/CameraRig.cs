using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Top-down chase camera with look-ahead, zoom and screen shake, or a first-person eye camera.</summary>
    public sealed class CameraRig
    {
        public readonly Camera cam;
        private Vector3 _focus;
        private float _shake, _t, _kick;
        public float distance = 24f, pitch = 58f, yaw = 0f;
        public float minDistance = 14f, maxDistance = 36f;
        public bool shakeEnabled = true;
        /// <summary>First-person field of view (degrees, from the settings) and the current zoom factor (1 = none).</summary>
        public float fov = 70f, zoom = 1f;
        public const float TopDownFov = 42f;
        private bool _firstPerson;
        public bool FirstPersonMode => _firstPerson;
        /// <summary>
        /// First person: degrees the drawn view pitch differs from the look pitch (recoil kick and shake nod; positive = down).
        /// The crosshair sits in the middle of the drawn view, so aimed shots add it.
        /// </summary>
        public float ViewPitchOffset { get; private set; }

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

        /// <summary>Switches lens settings between the top-down and the first-person camera.</summary>
        public void SetFirstPerson(bool on)
        {
            if (_firstPerson == on) return;
            _firstPerson = on;
            // the eye sits 0.75 m from any wall at most; a tiny near plane keeps the view model visible
            cam.nearClipPlane = on ? 0.03f : 0.3f;
            // the fog hides everything beyond ~150 m at eye level; a shorter far plane also helps depth precision
            cam.farClipPlane = on ? 170f : 260f;
            cam.fieldOfView = on ? fov * zoom : TopDownFov;
            _kick = 0;
            ViewPitchOffset = 0;
        }

        /// <summary>Recoil: the view jumps up a little and settles again.</summary>
        public void Kick(float degrees) { if (_firstPerson) _kick = Mathf.Min(_kick + degrees, 7f); }

        /// <summary>First-person camera at the eye. Shake turns the view a little instead of moving it (no clipping into walls).</summary>
        public void FirstPerson(Vector3 eye, float yawDeg, float pitchDeg, float rollDeg, float dt)
        {
            _t += dt;
            _focus = eye;
            _kick = Mathf.MoveTowards(_kick, 0f, dt * (5f + _kick * 9f));
            // shake rolls the view and nods it a little; turning it sideways would move the crosshair off the aim
            float sr = 0f, sy = 0f;
            if (_shake > 0.001f)
            {
                _shake *= Mathf.Exp(-8f * dt);
                sr = Mathf.Sin(_t * 47f) * _shake * 1.6f;
                sy = Mathf.Cos(_t * 31f) * _shake * 0.6f;
            }
            cam.transform.position = eye;
            ViewPitchOffset = -_kick + sy;
            cam.transform.rotation = Quaternion.Euler(Mathf.Clamp(pitchDeg + ViewPitchOffset, -89f, 89f), yawDeg, rollDeg + sr);
            float target = fov * zoom;
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, target, 1f - Mathf.Exp(-14f * dt));
        }

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
