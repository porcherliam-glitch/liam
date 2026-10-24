using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>What the first-person view model shows this frame.</summary>
    public struct ViewModelState
    {
        /// <summary>pistol, smg, rifle, shotgun, sniper, lmg, melee, grenade, med or null.</summary>
        public string cls;
        public float moving, legPhase, aim, melee, throwing, yawDelta, pitchDelta;
        /// <summary>0..1 while reloading, otherwise negative.</summary>
        public float reload;
        public bool sprinting, crouching, usingItem, dead;
    }

    /// <summary>
    /// The weapon and hands in front of the first-person camera. The whole model is built at half size and half
    /// distance: it looks the same through the lens but never reaches the walls the player stands next to
    /// (the player's radius is 0.75 m).
    /// </summary>
    public sealed class ViewModel
    {
        private const float Scale = 0.5f;
        private static readonly Vector3 HipPos = new Vector3(0.22f, -0.26f, 0.46f);
        private static readonly Vector3 AimPos = new Vector3(0f, -0.13f, 0.4f);

        private readonly Transform _root, _sway, _weapon, _flash;
        private readonly Transform _handR, _handL, _armR, _armL;
        private readonly Material _gun, _wood, _metal, _green, _white, _red, _skin, _sleeve, _flashMat;
        private string _shown = "?", _want;
        private float _raise = 1f, _kick, _flashT, _sprint, _swayX, _swayY;
        private Vector3 _muzzleLocal = new Vector3(0, 0, 0.3f);
        private bool _visible = true;

        public ViewModel(Transform cameraTransform)
        {
            _root = new GameObject("ViewModel").transform;
            _root.SetParent(cameraTransform, false);
            _root.localScale = Vector3.one * Scale;
            _sway = new GameObject("Sway").transform;
            _sway.SetParent(_root, false);
            _weapon = new GameObject("Weapon").transform;
            _weapon.SetParent(_sway, false);
            _gun = Mats.Lit(new Color(0.12f, 0.12f, 0.13f), 0.5f, 0.6f);
            _wood = Mats.Lit(new Color(0.36f, 0.25f, 0.15f), 0.3f);
            _metal = Mats.Lit(new Color(0.7f, 0.72f, 0.75f), 0.8f, 0.9f);
            _green = Mats.Lit(new Color(0.25f, 0.3f, 0.2f), 0.3f);
            _white = Mats.Lit(new Color(0.85f, 0.85f, 0.85f), 0.4f);
            _red = Mats.Lit(new Color(0.8f, 0.1f, 0.1f), 0.3f);
            _skin = Mats.Lit(new Color(0.78f, 0.62f, 0.5f), 0.25f);
            _sleeve = Mats.Lit(new Color(0.3f, 0.34f, 0.24f), 0.1f);
            _flashMat = Mats.Emissive(new Color(1f, 0.85f, 0.5f), new Color(1f, 0.75f, 0.35f), 6f);
            // arms: a sleeve from the hand back out of view, and a hand
            _armR = Part(_sway, "ArmR", CharacterView.CylinderMesh(), _sleeve, Vector3.zero, Vector3.one);
            _handR = Part(_sway, "HandR", CharacterView.SphereMesh(), _skin, Vector3.zero, Vector3.one * 0.1f);
            _armL = Part(_sway, "ArmL", CharacterView.CylinderMesh(), _sleeve, Vector3.zero, Vector3.one);
            _handL = Part(_sway, "HandL", CharacterView.SphereMesh(), _skin, Vector3.zero, Vector3.one * 0.1f);
            _flash = Part(_weapon, "Flash", CharacterView.SphereMesh(), _flashMat, Vector3.zero, Vector3.one * 0.12f);
            _flash.gameObject.SetActive(false);
        }

        private static Transform Part(Transform parent, string name, Mesh mesh, Material mat, Vector3 pos, Vector3 size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = size;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            // the model is right in front of the flashlight and the eye: it must not cast shadows
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = true;
            return go.transform;
        }

        /// <summary>World position of the muzzle (muzzle flash, sparks and the flash light start here).</summary>
        public Vector3 MuzzleWorld => _weapon.TransformPoint(_muzzleLocal + new Vector3(0, 0, 0.05f));
        /// <summary>World position of the ejection port (spent casings).</summary>
        public Vector3 EjectWorld => _weapon.TransformPoint(new Vector3(0.05f, 0.06f, Mathf.Max(0.05f, _muzzleLocal.z * 0.3f)));
        public Vector3 RightWorld => _root.parent.right;

        public void SetVisible(bool v)
        {
            if (_visible == v) return;
            _visible = v;
            _root.gameObject.SetActive(v);
        }

        /// <summary>Recoil kick and muzzle flash for one shot.</summary>
        public void Fire(float strength)
        {
            _kick = Mathf.Min(1.4f, _kick + 0.55f * Mathf.Max(0.3f, strength));
            if (_want == "melee" || _want == "grenade" || _want == "med" || _want == null) return;
            _flashT = 0.05f;
            _flash.gameObject.SetActive(true);
            _flash.localPosition = _muzzleLocal + new Vector3(0, 0, 0.06f);
            _flash.localRotation = Quaternion.Euler(0, 0, Random.Range(0f, 360f));
            float s = Random.Range(0.12f, 0.2f) * (_want == "shotgun" || _want == "lmg" ? 1.4f : _want == "pistol" ? 0.8f : 1f);
            _flash.localScale = new Vector3(s, s, s * 1.6f);
        }

        private void Build(string cls)
        {
            for (int i = _weapon.childCount - 1; i >= 0; i--)
            {
                var c = _weapon.GetChild(i);
                if (c != _flash) Object.Destroy(c.gameObject);
            }
            _shown = cls;
            _muzzleLocal = new Vector3(0, 0, 0.25f);
            var box = CharacterView.BoxMesh();
            switch (cls)
            {
                case "pistol":
                    Part(_weapon, "Slide", box, _gun, new Vector3(0, 0.02f, 0.06f), new Vector3(0.06f, 0.07f, 0.24f));
                    Part(_weapon, "Grip", box, _gun, new Vector3(0, -0.07f, -0.02f), new Vector3(0.055f, 0.14f, 0.07f));
                    _muzzleLocal = new Vector3(0, 0.02f, 0.18f);
                    break;
                case "smg":
                    Part(_weapon, "Body", box, _gun, new Vector3(0, 0, 0.12f), new Vector3(0.08f, 0.12f, 0.48f));
                    Part(_weapon, "Mag", box, _gun, new Vector3(0, -0.13f, 0.14f), new Vector3(0.05f, 0.18f, 0.06f));
                    Part(_weapon, "Grip", box, _gun, new Vector3(0, -0.09f, -0.04f), new Vector3(0.05f, 0.12f, 0.06f));
                    _muzzleLocal = new Vector3(0, 0, 0.36f);
                    break;
                case "rifle":
                    Part(_weapon, "Body", box, _gun, new Vector3(0, 0, 0.2f), new Vector3(0.08f, 0.12f, 0.85f));
                    Part(_weapon, "Mag", box, _gun, new Vector3(0, -0.15f, 0.2f), new Vector3(0.06f, 0.2f, 0.1f));
                    Part(_weapon, "Stock", box, _wood, new Vector3(0, -0.03f, -0.24f), new Vector3(0.07f, 0.13f, 0.26f));
                    Part(_weapon, "Sight", box, _gun, new Vector3(0, 0.08f, 0.05f), new Vector3(0.03f, 0.04f, 0.12f));
                    _muzzleLocal = new Vector3(0, 0, 0.62f);
                    break;
                case "shotgun":
                    Part(_weapon, "Barrel", box, _gun, new Vector3(0, 0.02f, 0.25f), new Vector3(0.07f, 0.08f, 0.9f));
                    Part(_weapon, "Pump", box, _wood, new Vector3(0, -0.04f, 0.32f), new Vector3(0.08f, 0.06f, 0.24f));
                    Part(_weapon, "Stock", box, _wood, new Vector3(0, -0.04f, -0.16f), new Vector3(0.08f, 0.14f, 0.34f));
                    _muzzleLocal = new Vector3(0, 0.02f, 0.7f);
                    break;
                case "sniper":
                    Part(_weapon, "Barrel", box, _gun, new Vector3(0, 0, 0.3f), new Vector3(0.07f, 0.09f, 1.15f));
                    Part(_weapon, "Scope", box, _gun, new Vector3(0, 0.1f, 0.12f), new Vector3(0.06f, 0.07f, 0.35f));
                    Part(_weapon, "Stock", box, _wood, new Vector3(0, -0.04f, -0.26f), new Vector3(0.08f, 0.14f, 0.3f));
                    _muzzleLocal = new Vector3(0, 0, 0.87f);
                    break;
                case "lmg":
                    Part(_weapon, "Body", box, _gun, new Vector3(0, 0, 0.25f), new Vector3(0.11f, 0.15f, 1.0f));
                    Part(_weapon, "Box", box, _green, new Vector3(0, -0.15f, 0.1f), new Vector3(0.18f, 0.16f, 0.2f));
                    Part(_weapon, "Handle", box, _gun, new Vector3(0, 0.12f, 0.2f), new Vector3(0.03f, 0.06f, 0.14f));
                    _muzzleLocal = new Vector3(0, 0, 0.75f);
                    break;
                case "melee":
                    Part(_weapon, "Handle", box, _wood, new Vector3(0, 0, 0), new Vector3(0.05f, 0.05f, 0.18f));
                    Part(_weapon, "Guard", box, _gun, new Vector3(0, 0, 0.1f), new Vector3(0.1f, 0.03f, 0.03f));
                    Part(_weapon, "Blade", box, _metal, new Vector3(0, 0, 0.3f), new Vector3(0.025f, 0.06f, 0.38f));
                    break;
                case "grenade":
                    Part(_weapon, "Body", CharacterView.SphereMesh(), _green, new Vector3(0, 0.02f, 0.05f), Vector3.one * 0.12f);
                    Part(_weapon, "Fuse", box, _metal, new Vector3(0, 0.1f, 0.05f), new Vector3(0.03f, 0.05f, 0.03f));
                    break;
                case "med":
                    Part(_weapon, "Kit", box, _white, new Vector3(0, 0, 0.05f), new Vector3(0.2f, 0.12f, 0.16f));
                    Part(_weapon, "Cross", box, _red, new Vector3(0, 0.061f, 0.05f), new Vector3(0.1f, 0.005f, 0.03f));
                    break;
            }
            bool twoHanded = cls == "smg" || cls == "rifle" || cls == "shotgun" || cls == "sniper" || cls == "lmg" || cls == "pistol";
            _armL.gameObject.SetActive(twoHanded);
            _handL.gameObject.SetActive(twoHanded);
            bool hands = cls != null;
            _armR.gameObject.SetActive(hands);
            _handR.gameObject.SetActive(hands);
            if (twoHanded)
            {
                // support hand under the front of the gun (pistol: wrapped around the grip)
                var hl = cls == "pistol" ? new Vector3(-0.04f, -0.1f, 0.0f) : new Vector3(0f, -0.08f, cls == "smg" ? 0.24f : 0.36f);
                Limb(_armL, _handL, hl, new Vector3(-0.3f, -0.45f, -0.15f));
            }
            Limb(_armR, _handR, new Vector3(0.0f, -0.09f, -0.03f), new Vector3(0.14f, -0.42f, -0.5f));
        }

        /// <summary>Places a sleeve from the hand (weapon space) back to a point out of view.</summary>
        private void Limb(Transform arm, Transform hand, Vector3 handPos, Vector3 elbow)
        {
            hand.localPosition = handPos;
            var d = elbow - handPos;
            arm.localPosition = handPos + d * 0.5f;
            arm.localRotation = Quaternion.FromToRotation(Vector3.up, d.normalized);
            arm.localScale = new Vector3(0.11f, d.magnitude, 0.11f);
        }

        public void Update(float dt, in ViewModelState s)
        {
            SetVisible(!s.dead);
            if (s.dead) return;
            // weapon change: lower the old one, swap, raise the new one
            _want = s.cls;
            if (_want != _shown)
            {
                _raise = Mathf.MoveTowards(_raise, 0f, dt * 8f);
                if (_raise <= 0f) Build(_want);
            }
            else _raise = Mathf.MoveTowards(_raise, s.usingItem ? 0.15f : 1f, dt * 6f);
            if (_flashT > 0) { _flashT -= dt; if (_flashT <= 0) _flash.gameObject.SetActive(false); }
            _kick *= Mathf.Exp(-14f * dt);
            _sprint = Mathf.MoveTowards(_sprint, s.sprinting ? 1f : 0f, dt * 5f);
            float k = 1f - Mathf.Exp(-10f * dt);
            _swayX = Mathf.Lerp(_swayX, Mathf.Clamp(-s.yawDelta * 0.004f, -0.05f, 0.05f), k);
            _swayY = Mathf.Lerp(_swayY, Mathf.Clamp(s.pitchDelta * 0.004f, -0.04f, 0.04f), k);

            float aim = s.aim * (1f - _sprint);
            var pos = Vector3.Lerp(HipPos, AimPos, aim);
            var rot = Vector3.zero;
            float still = 1f - aim * 0.85f;
            pos.x += Mathf.Sin(s.legPhase) * 0.014f * s.moving * still + _swayX * still;
            pos.y -= Mathf.Abs(Mathf.Cos(s.legPhase)) * 0.018f * s.moving * still - _swayY * still;
            if (s.crouching) pos.y += 0.015f;
            // sprint: weapon tilted down and to the side
            pos += new Vector3(0.04f, -0.06f, -0.06f) * _sprint;
            rot += new Vector3(22f, -28f, 8f) * _sprint;
            // recoil
            pos.z -= 0.07f * _kick;
            pos.y += 0.01f * _kick;
            rot.x -= 9f * _kick;
            // reload: dip and roll the weapon
            if (s.reload >= 0f)
            {
                float r = Mathf.Sin(Mathf.Clamp01(s.reload) * Mathf.PI);
                pos.y -= 0.12f * r;
                rot += new Vector3(32f, 0f, -28f) * r;
            }
            // melee swing from the right
            if (s.melee > 0f)
            {
                float t = 1f - s.melee;
                float a = Mathf.Sin(t * Mathf.PI);
                pos += new Vector3(-0.16f * a, 0.05f * a, 0.12f * a);
                rot += new Vector3(-15f * a, 55f - 120f * t, -35f * a);
            }
            // grenade throw: everything ducks briefly
            pos.y -= 0.2f * s.throwing;
            rot.x += 25f * s.throwing;
            // weapon change and item use
            float low = 1f - _raise;
            pos.y -= 0.32f * low;
            rot.x += 40f * low;
            _sway.localPosition = pos;
            _sway.localRotation = Quaternion.Euler(rot);
        }

        public void Destroy() { if (_root != null) Object.Destroy(_root.gameObject); }
    }
}
