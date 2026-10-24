using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Procedurally animated humanoid built from simple meshes (player and zombies).</summary>
    public sealed class CharacterView
    {
        public readonly GameObject root;
        private readonly Transform _body, _torso, _head, _armL, _armR, _legL, _legR, _weapon;
        private readonly Renderer[] _renderers;
        private readonly Material[][] _baseMats;
        private readonly Material _flashMat;
        private readonly bool _zombie;
        private float _deathT, _flash;
        private bool _flashing;
        public float scale = 1f;
        /// <summary>Vertical scale (big zombies are capped so they stay below roofs).</summary>
        public float heightScale = 1f;
        private string _weaponKey;

        private static Mesh _box, _sphere, _capsule, _cylinder;

        internal static Mesh BoxMesh()
        {
            if (_box != null) return _box;
            var mb = new MeshBuilder();
            mb.BoxCenter(null, Vector3.zero, Vector3.one);
            return _box = mb.Build("unitBox");
        }

        internal static Mesh SphereMesh()
        {
            if (_sphere != null) return _sphere;
            var mb = new MeshBuilder();
            mb.Sphere(null, Vector3.zero, Vector3.one * 0.5f, 10, 7);
            return _sphere = mb.Build("unitSphere");
        }

        /// <summary>Unit cylinder from y = -0.5 to 0.5 with radius 0.5.</summary>
        internal static Mesh CylinderMesh()
        {
            if (_cylinder != null) return _cylinder;
            var mb = new MeshBuilder();
            mb.Cylinder(null, new Vector3(0, -0.5f, 0), 0.5f, 1f, 10, true);
            return _cylinder = mb.Build("unitCylinder");
        }

        private static Mesh CapsuleMesh()
        {
            if (_capsule != null) return _capsule;
            var mb = new MeshBuilder();
            mb.Cylinder(null, new Vector3(0, -0.5f, 0), 0.5f, 1f, 8, true);
            mb.Sphere(null, new Vector3(0, -0.5f, 0), Vector3.one * 0.5f, 8, 5);
            mb.Sphere(null, new Vector3(0, 0.5f, 0), Vector3.one * 0.5f, 8, 5);
            return _capsule = mb.Build("unitCapsule");
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
            mr.shadowCastingMode = ShadowCastingMode.On;
            return go.transform;
        }

        private static Transform Pivot(Transform parent, string name, Vector3 pos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = pos;
            return t;
        }

        /// <param name="skin">Skin colour.</param>
        /// <param name="cloth">Shirt colour.</param>
        /// <param name="pants">Trouser colour.</param>
        public CharacterView(Transform parent, string name, Color skin, Color cloth, Color pants, bool zombie, Color eyes)
        {
            _zombie = zombie;
            root = new GameObject(name);
            root.transform.SetParent(parent, false);
            var skinM = Mats.Lit(skin, 0.25f);
            var clothM = Mats.Lit(cloth, 0.1f);
            var pantsM = Mats.Lit(pants, 0.1f);
            _body = Pivot(root.transform, "Body", Vector3.zero);
            _legL = Pivot(_body, "LegL", new Vector3(-0.14f, 0.92f, 0));
            _legR = Pivot(_body, "LegR", new Vector3(0.14f, 0.92f, 0));
            Part(_legL, "Leg", CapsuleMesh(), pantsM, new Vector3(0, -0.45f, 0), new Vector3(0.2f, 0.45f, 0.22f));
            Part(_legR, "Leg", CapsuleMesh(), pantsM, new Vector3(0, -0.45f, 0), new Vector3(0.2f, 0.45f, 0.22f));
            Part(_legL, "Boot", BoxMesh(), Mats.Lit(new Color(0.12f, 0.1f, 0.09f), 0.2f), new Vector3(0, -0.86f, 0.05f), new Vector3(0.2f, 0.12f, 0.3f));
            Part(_legR, "Boot", BoxMesh(), Mats.Lit(new Color(0.12f, 0.1f, 0.09f), 0.2f), new Vector3(0, -0.86f, 0.05f), new Vector3(0.2f, 0.12f, 0.3f));
            _torso = Pivot(_body, "Torso", new Vector3(0, 0.92f, 0));
            Part(_torso, "Chest", CapsuleMesh(), clothM, new Vector3(0, 0.33f, 0), new Vector3(0.46f, 0.3f, 0.28f));
            _head = Pivot(_torso, "Head", new Vector3(0, 0.78f, 0));
            Part(_head, "Skull", SphereMesh(), skinM, new Vector3(0, 0.08f, 0), new Vector3(0.26f, 0.3f, 0.27f));
            var eyeM = Mats.Emissive(eyes, eyes, zombie ? 3f : 0.2f);
            Part(_head, "EyeL", SphereMesh(), eyeM, new Vector3(-0.055f, 0.11f, 0.12f), Vector3.one * 0.045f);
            Part(_head, "EyeR", SphereMesh(), eyeM, new Vector3(0.055f, 0.11f, 0.12f), Vector3.one * 0.045f);
            if (!zombie)
            {
                Part(_head, "Helmet", SphereMesh(), Mats.Lit(new Color(0.22f, 0.26f, 0.18f), 0.3f), new Vector3(0, 0.15f, -0.01f), new Vector3(0.3f, 0.22f, 0.31f));
                Part(_torso, "Pack", BoxMesh(), Mats.Lit(new Color(0.3f, 0.28f, 0.2f), 0.1f), new Vector3(0, 0.38f, -0.2f), new Vector3(0.36f, 0.42f, 0.18f));
                Part(_torso, "Vest", BoxMesh(), Mats.Lit(new Color(0.2f, 0.23f, 0.17f), 0.15f), new Vector3(0, 0.36f, 0.04f), new Vector3(0.44f, 0.34f, 0.24f));
            }
            _armL = Pivot(_torso, "ArmL", new Vector3(-0.29f, 0.58f, 0));
            _armR = Pivot(_torso, "ArmR", new Vector3(0.29f, 0.58f, 0));
            Part(_armL, "Arm", CapsuleMesh(), clothM, new Vector3(0, -0.28f, 0), new Vector3(0.14f, 0.27f, 0.14f));
            Part(_armR, "Arm", CapsuleMesh(), clothM, new Vector3(0, -0.28f, 0), new Vector3(0.14f, 0.27f, 0.14f));
            Part(_armL, "Hand", SphereMesh(), skinM, new Vector3(0, -0.6f, 0), Vector3.one * 0.12f);
            Part(_armR, "Hand", SphereMesh(), skinM, new Vector3(0, -0.6f, 0), Vector3.one * 0.12f);
            if (!zombie) _weapon = Pivot(_torso, "Weapon", new Vector3(0.12f, 0.42f, 0.42f));
            _renderers = root.GetComponentsInChildren<Renderer>();
            _baseMats = new Material[_renderers.Length][];
            for (int i = 0; i < _renderers.Length; i++) _baseMats[i] = _renderers[i].sharedMaterials;
            _flashMat = Mats.Emissive(Color.white, Color.white, 1.5f);
        }

        /// <summary>Weapon model by class (pistol, smg, rifle, shotgun, sniper, lmg, melee, grenade, med or none).</summary>
        public void SetWeapon(string cls)
        {
            if (_weapon == null || cls == _weaponKey) return;
            _weaponKey = cls;
            for (int i = _weapon.childCount - 1; i >= 0; i--) Object.Destroy(_weapon.GetChild(i).gameObject);
            if (string.IsNullOrEmpty(cls)) return;
            var gun = Mats.Lit(new Color(0.12f, 0.12f, 0.13f), 0.5f, 0.6f);
            var wood = Mats.Lit(new Color(0.36f, 0.25f, 0.15f), 0.3f);
            switch (cls)
            {
                case "pistol": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0, 0.05f), new Vector3(0.06f, 0.12f, 0.24f)); break;
                case "smg": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0, 0.12f), new Vector3(0.08f, 0.14f, 0.48f)); Part(_weapon, "M", BoxMesh(), gun, new Vector3(0, -0.13f, 0.1f), new Vector3(0.05f, 0.18f, 0.06f)); break;
                case "rifle": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0, 0.2f), new Vector3(0.08f, 0.13f, 0.85f)); Part(_weapon, "M", BoxMesh(), gun, new Vector3(0, -0.15f, 0.2f), new Vector3(0.06f, 0.2f, 0.1f)); Part(_weapon, "S", BoxMesh(), wood, new Vector3(0, -0.03f, -0.22f), new Vector3(0.07f, 0.14f, 0.26f)); break;
                case "shotgun": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0.02f, 0.25f), new Vector3(0.07f, 0.08f, 0.9f)); Part(_weapon, "S", BoxMesh(), wood, new Vector3(0, -0.04f, -0.15f), new Vector3(0.08f, 0.15f, 0.35f)); break;
                case "sniper": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0, 0.3f), new Vector3(0.07f, 0.1f, 1.15f)); Part(_weapon, "Sc", BoxMesh(), gun, new Vector3(0, 0.1f, 0.15f), new Vector3(0.06f, 0.07f, 0.35f)); Part(_weapon, "S", BoxMesh(), wood, new Vector3(0, -0.04f, -0.25f), new Vector3(0.08f, 0.15f, 0.3f)); break;
                case "lmg": Part(_weapon, "G", BoxMesh(), gun, new Vector3(0, 0, 0.25f), new Vector3(0.11f, 0.16f, 1.0f)); Part(_weapon, "B", BoxMesh(), Mats.Lit(new Color(0.25f, 0.27f, 0.2f), 0.2f), new Vector3(0, -0.15f, 0.1f), new Vector3(0.18f, 0.16f, 0.2f)); break;
                case "melee": Part(_weapon, "H", BoxMesh(), wood, new Vector3(0, 0, 0), new Vector3(0.05f, 0.05f, 0.18f)); Part(_weapon, "B", BoxMesh(), Mats.Lit(new Color(0.7f, 0.72f, 0.75f), 0.8f, 0.9f), new Vector3(0, 0, 0.25f), new Vector3(0.03f, 0.06f, 0.35f)); break;
                case "grenade": Part(_weapon, "N", SphereMesh(), Mats.Lit(new Color(0.25f, 0.3f, 0.2f), 0.3f), new Vector3(0, 0, 0.05f), Vector3.one * 0.12f); break;
                case "med": Part(_weapon, "K", BoxMesh(), Mats.Lit(new Color(0.85f, 0.85f, 0.85f), 0.4f), new Vector3(0, 0, 0.05f), new Vector3(0.18f, 0.1f, 0.14f)); break;
            }
            // the gun sits right next to the flashlight: its shadow would cut a dark wedge into the beam
            foreach (var r in _weapon.GetComponentsInChildren<MeshRenderer>()) r.shadowCastingMode = ShadowCastingMode.Off;
        }

        public void SetVisible(bool v)
        {
            if (root.activeSelf != v) root.SetActive(v);
        }

        /// <summary>Per-frame pose.</summary>
        /// <param name="moving">0..1 movement amount.</param>
        /// <param name="legPhase">Walk cycle phase (radians-ish, from the simulation).</param>
        /// <param name="attack">Zombie attack animation 0..1 / player melee swing.</param>
        /// <param name="lunge">Zombie strike: metres the body moves forward (negative = leans back during the wind-up).</param>
        public void Pose(Vector3 pos, float yawDeg, float moving, float legPhase, float attack, bool crouch, bool dead, float flash, float dt, bool aiming = true, float lunge = 0f)
        {
            var t = root.transform;
            t.localPosition = pos;
            t.localRotation = Quaternion.Euler(0, yawDeg, 0);
            t.localScale = new Vector3(scale, heightScale, scale);
            float swing = Mathf.Sin(legPhase) * 35f * moving;
            float bob = Mathf.Abs(Mathf.Cos(legPhase)) * 0.05f * moving;
            if (dead)
            {
                _deathT += dt;
                float k = Mathf.Clamp01(_deathT / 0.45f);
                _body.localRotation = Quaternion.Euler(-88f * k * k, 0, 0);
                // sink into the floor only in the last seconds before the corpse is removed (25 s)
                _body.localPosition = new Vector3(0, 0.12f * k - Mathf.Max(0, _deathT - 23f) * 0.3f, -0.2f * k);
                _legL.localRotation = Quaternion.Euler(-10, 0, 0);
                _legR.localRotation = Quaternion.Euler(10, 0, 0);
                _armL.localRotation = Quaternion.Euler(-150 * k, 0, -20);
                _armR.localRotation = Quaternion.Euler(-160 * k, 0, 20);
            }
            else
            {
                _deathT = 0;
                float crouchY = crouch ? -0.3f : 0f;
                _body.localRotation = Quaternion.identity;
                _body.localPosition = new Vector3(0, bob + crouchY, lunge / Mathf.Max(0.01f, scale));
                _legL.localRotation = Quaternion.Euler(swing + (crouch ? -50 : 0), 0, 0);
                _legR.localRotation = Quaternion.Euler(-swing + (crouch ? -50 : 0), 0, 0);
                if (_zombie)
                {
                    float sway = Mathf.Sin(legPhase * 0.5f + 1f) * 8f;
                    float reach = -80f - attack * 50f;
                    _torso.localRotation = Quaternion.Euler(18f + attack * 12f, sway * 0.5f, 0);
                    _armL.localRotation = Quaternion.Euler(reach + Mathf.Sin(legPhase + 1.3f) * 10f, 0, -8f);
                    _armR.localRotation = Quaternion.Euler(reach + Mathf.Sin(legPhase) * 10f, 0, 8f);
                    _head.localRotation = Quaternion.Euler(-10f, sway, Mathf.Sin(legPhase * 0.3f) * 10f);
                }
                else
                {
                    _torso.localRotation = Quaternion.Euler(crouch ? 15f : 4f, 0, 0);
                    if (aiming)
                    {
                        float melee = attack > 0 ? Mathf.Sin(attack * Mathf.PI) * 70f : 0f;
                        _armR.localRotation = Quaternion.Euler(-80f, -melee, 0);
                        _armL.localRotation = Quaternion.Euler(-75f, 35f, 0);
                    }
                    else
                    {
                        _armL.localRotation = Quaternion.Euler(-swing * 0.8f, 0, -5);
                        _armR.localRotation = Quaternion.Euler(swing * 0.8f, 0, 5);
                    }
                    _head.localRotation = Quaternion.identity;
                }
            }
            bool wantFlash = flash > 0.001f;
            if (wantFlash != _flashing)
            {
                _flashing = wantFlash;
                for (int i = 0; i < _renderers.Length; i++)
                {
                    if (_renderers[i] == null) continue;
                    if (wantFlash)
                    {
                        var arr = new Material[_baseMats[i].Length];
                        for (int k = 0; k < arr.Length; k++) arr[k] = _flashMat;
                        _renderers[i].sharedMaterials = arr;
                    }
                    else _renderers[i].sharedMaterials = _baseMats[i];
                }
            }
        }

        public void Destroy() { if (root != null) Object.Destroy(root); }
    }
}
