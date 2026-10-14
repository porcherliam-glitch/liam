using System;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Moves a rigid four-legged model (wolf from <c>Tools/Blender/build_characters.py</c>) like a puppet: a trot with the
    /// diagonal leg pairs together, measured from the movement of the animal, a bobbing body and head, a wagging tail while
    /// standing and a raised tail when running, a jerk of the head when hit; dead animals stop moving their legs. Rearing up
    /// (telegraph) and falling over stay with the enemy's body pivot (<c>EnemyController</c>).
    /// </summary>
    /// <remarks>GameObject: the model root (pivot on the ground, looking along +Z). Pure presentation, writes local rotations.</remarks>
    [DefaultExecutionOrder(100)]
    [DisallowMultipleComponent]
    public sealed class QuadrupedPuppet : MonoBehaviour
    {
        [Header("Gelenke (Namen aus dem Blender-Modell)")]
        [SerializeField] private Transform torso = null;
        [SerializeField] private Transform head = null;
        [SerializeField] private Transform tail = null;
        [SerializeField] private Transform frontUpperLeft = null;
        [SerializeField] private Transform frontLowerLeft = null;
        [SerializeField] private Transform frontUpperRight = null;
        [SerializeField] private Transform frontLowerRight = null;
        [SerializeField] private Transform hindUpperLeft = null;
        [SerializeField] private Transform hindLowerLeft = null;
        [SerializeField] private Transform hindUpperRight = null;
        [SerializeField] private Transform hindLowerRight = null;

        [Header("Bewegung")]
        [Tooltip("Kampf-Teilnehmer (Tod, Treffer, gemessene Bewegung). Leer = im Elternobjekt suchen.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Strecke eines vollen Schrittzyklus in Metern.")]
        [Range(0.4f, 3f)] [SerializeField] private float strideLength = 1.3f;

        [Tooltip("Geschwindigkeit, ab der die Beine voll ausschlagen (m/s).")]
        [Range(1f, 12f)] [SerializeField] private float fullSwingSpeed = 6f;

        [Tooltip("Größter Beinausschlag in Grad.")]
        [Range(5f, 60f)] [SerializeField] private float legSwing = 32f;

        private Transform[] _joints;
        private Quaternion[] _rest;
        private Vector3 _torsoRest;
        private Transform _mover;
        private Vector3 _lastPosition;
        private bool _started;
        private float _speed;
        private float _phase;
        private float _flinch;
        private float _alive = 1f;

        /// <summary>Smoothed speed in m/s.</summary>
        public float Speed => _speed;

        /// <summary>Assigns the joints by the part names of the Blender model (editor tools, tests).</summary>
        /// <param name="root">Model root.</param>
        public void BindByName(Transform root)
        {
            torso = Find(root, "Torso");
            head = Find(root, "Head");
            tail = Find(root, "Tail");
            frontUpperLeft = Find(root, "FrontUpper.L");
            frontLowerLeft = Find(root, "FrontLower.L");
            frontUpperRight = Find(root, "FrontUpper.R");
            frontLowerRight = Find(root, "FrontLower.R");
            hindUpperLeft = Find(root, "HindUpper.L");
            hindLowerLeft = Find(root, "HindLower.L");
            hindUpperRight = Find(root, "HindUpper.R");
            hindLowerRight = Find(root, "HindLower.R");
        }

        private void Awake()
        {
            if (combatant == null)
            {
                combatant = GetComponentInParent<Combatant>();
            }

            _mover = combatant != null ? combatant.transform : transform;
            _joints = new[]
            {
                torso, head, tail, frontUpperLeft, frontLowerLeft, frontUpperRight, frontLowerRight, hindUpperLeft, hindLowerLeft, hindUpperRight,
                hindLowerRight
            };
            _rest = new Quaternion[_joints.Length];
            for (int i = 0; i < _joints.Length; i++)
            {
                _rest[i] = _joints[i] != null ? _joints[i].localRotation : Quaternion.identity;
            }

            _torsoRest = torso != null ? torso.localPosition : Vector3.zero;
        }

        private void OnEnable()
        {
            if (combatant != null)
            {
                combatant.HitReceived += OnHitReceived;
            }

            _started = false;
        }

        private void OnDisable()
        {
            if (combatant != null)
            {
                combatant.HitReceived -= OnHitReceived;
            }
        }

        private void OnHitReceived(HitReport report)
        {
            _flinch = 1f;
        }

        private void LateUpdate()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f)
            {
                return;
            }

            Vector3 position = _mover.position;
            if (!_started)
            {
                _lastPosition = position;
                _started = true;
            }

            Vector3 delta = position - _lastPosition;
            _lastPosition = position;
            float horizontal = new Vector2(delta.x, delta.z).magnitude / dt;
            if (horizontal > 40f)
            {
                horizontal = 0f;
            }

            bool dead = combatant != null && !combatant.IsAlive;
            _alive = Mathf.MoveTowards(_alive, dead ? 0f : 1f, dt * 3f);
            _speed = Mathf.Lerp(_speed, horizontal * _alive, 1f - Mathf.Exp(-10f * dt));
            _phase = Mathf.Repeat(_phase + _speed / strideLength * Mathf.PI * 2f * dt, Mathf.PI * 2f);
            _flinch = Mathf.MoveTowards(_flinch, 0f, dt * 4f);

            float amount = Mathf.Clamp01(_speed / fullSwingSpeed);
            float walk = Mathf.Clamp01(_speed / 0.3f);
            float swing = legSwing * Mathf.Lerp(0.5f, 1f, amount) * walk;
            float sin = Mathf.Sin(_phase);
            float lift = Mathf.Max(0f, -Mathf.Cos(_phase));
            float liftOther = Mathf.Max(0f, Mathf.Cos(_phase));
            float time = Time.time;

            // Trot: front left with hind right, front right with hind left (negative X = leg forward).
            Set(3, sin * swing, 0f, 0f);
            Set(4, lift * swing * 1.2f, 0f, 0f);
            Set(9, sin * swing, 0f, 0f);
            Set(10, -lift * swing * 0.9f, 0f, 0f);
            Set(5, -sin * swing, 0f, 0f);
            Set(6, liftOther * swing * 1.2f, 0f, 0f);
            Set(7, -sin * swing, 0f, 0f);
            Set(8, -liftOther * swing * 0.9f, 0f, 0f);

            if (torso != null)
            {
                float bob = Mathf.Abs(Mathf.Cos(_phase)) * 0.025f * walk;
                torso.localPosition = _torsoRest + new Vector3(0f, bob, 0f);
            }

            Set(0, Mathf.Cos(_phase * 2f) * 2f * walk, 0f, 0f);
            float look = Mathf.Sin(time * 0.6f) * 18f * (1f - walk) * _alive;
            Set(1, -Mathf.Cos(_phase * 2f) * 4f * walk + 8f * amount - 25f * _flinch, look, 0f);
            float wag = Mathf.Sin(time * 7f) * 18f * (1f - amount) * _alive;
            Set(2, 25f * amount * _alive - 15f * (1f - _alive), wag, 0f);
        }

        private void Set(int joint, float x, float y, float z)
        {
            Transform part = _joints[joint];
            if (part != null)
            {
                part.localRotation = _rest[joint] * Quaternion.Euler(x, y, z);
            }
        }

        private static Transform Find(Transform root, string name)
        {
            foreach (Transform part in root.GetComponentsInChildren<Transform>(true))
            {
                if (string.Equals(part.name, name, StringComparison.Ordinal))
                {
                    return part;
                }
            }

            return null;
        }
    }
}
