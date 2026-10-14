using System;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Moves a rigid humanoid model (parts from <c>Tools/Blender/build_characters.py</c>, joints as transforms) like a puppet
    /// while there are no baked animations: legs, hips and arms swing with the walking speed (measured from the movement of the
    /// character), the body bobs and leans forward when running, tucks the legs in the air, flinches when hit and falls over
    /// when the combatant dies. Arms with a hand target reach for it instead (two-bone IK, e.g. sword grip and shield handle,
    /// which <c>PlayerWeaponPose</c> moves), so a sword swing moves the whole arm.
    /// </summary>
    /// <remarks>
    /// GameObject: the model root (child of the character, pivot on the ground, looking along +Z). Runs after the default
    /// LateUpdate (weapon poses), pure presentation: it only writes local rotations of the parts and of its own transform.
    /// </remarks>
    [DefaultExecutionOrder(100)]
    [DisallowMultipleComponent]
    public sealed class HumanoidPuppet : MonoBehaviour
    {
        [Header("Gelenke (Namen aus dem Blender-Modell)")]
        [SerializeField] private Transform pelvis = null;
        [SerializeField] private Transform torso = null;
        [SerializeField] private Transform head = null;
        [SerializeField] private Transform upperArmRight = null;
        [SerializeField] private Transform forearmRight = null;
        [SerializeField] private Transform upperArmLeft = null;
        [SerializeField] private Transform forearmLeft = null;
        [SerializeField] private Transform thighRight = null;
        [SerializeField] private Transform shinRight = null;
        [SerializeField] private Transform thighLeft = null;
        [SerializeField] private Transform shinLeft = null;

        [Header("Hände")]
        [Tooltip("Ziel der rechten Hand (z. B. Schwertgriff). Leer = Arm schwingt beim Gehen.")]
        [SerializeField] private Transform rightHandTarget = null;

        [Tooltip("Ziel der linken Hand (z. B. Schildgriff). Leer = Arm schwingt beim Gehen.")]
        [SerializeField] private Transform leftHandTarget = null;

        [Tooltip("Abstand Unterarm-Gelenk bis Handmitte in Metern.")]
        [Range(0.1f, 0.6f)] [SerializeField] private float handLength = 0.29f;

        [Header("Bewegung")]
        [Tooltip("Kampf-Teilnehmer: Tod (umfallen) und Treffer (zucken). Leer = im Elternobjekt suchen.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Strecke eines vollen Schrittzyklus (zwei Schritte) in Metern.")]
        [Range(0.5f, 3f)] [SerializeField] private float strideLength = 1.5f;

        [Tooltip("Geschwindigkeit, ab der die Bewegung voll ausschlägt (m/s).")]
        [Range(1f, 10f)] [SerializeField] private float fullSwingSpeed = 5f;

        [Tooltip("Größter Beinausschlag in Grad.")]
        [Range(5f, 70f)] [SerializeField] private float legSwing = 38f;

        private Quaternion[] _rest;
        private Transform[] _joints;
        private Vector3 _pelvisRest;
        private Vector3 _lastPosition;
        private float _speed;
        private float _verticalSpeed;
        private float _phase;
        private float _flinch;
        private float _death;
        private bool _started;

        /// <summary>Smoothed horizontal speed in m/s (for tests and debug output).</summary>
        public float Speed => _speed;

        /// <summary>Assigns the joints by the part names of the Blender model (editor tools, tests).</summary>
        /// <param name="root">Model root.</param>
        public void BindByName(Transform root)
        {
            pelvis = FindPart(root, "Pelvis");
            torso = FindPart(root, "Torso");
            head = FindPart(root, "Head");
            upperArmRight = FindPart(root, "UpperArm.R");
            forearmRight = FindPart(root, "Forearm.R");
            upperArmLeft = FindPart(root, "UpperArm.L");
            forearmLeft = FindPart(root, "Forearm.L");
            thighRight = FindPart(root, "Thigh.R");
            shinRight = FindPart(root, "Shin.R");
            thighLeft = FindPart(root, "Thigh.L");
            shinLeft = FindPart(root, "Shin.L");
        }

        /// <summary>Sets the hand targets (null = the arm swings).</summary>
        /// <param name="right">Right hand target.</param>
        /// <param name="left">Left hand target.</param>
        public void SetHandTargets(Transform right, Transform left)
        {
            rightHandTarget = right;
            leftHandTarget = left;
        }

        private void Awake()
        {
            if (combatant == null)
            {
                combatant = GetComponentInParent<Combatant>();
            }

            _joints = new[] { pelvis, torso, head, upperArmRight, forearmRight, upperArmLeft, forearmLeft, thighRight, shinRight, thighLeft, shinLeft };
            _rest = new Quaternion[_joints.Length];
            for (int i = 0; i < _joints.Length; i++)
            {
                _rest[i] = _joints[i] != null ? _joints[i].localRotation : Quaternion.identity;
            }

            _pelvisRest = pelvis != null ? pelvis.localPosition : Vector3.zero;
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

            Vector3 position = transform.position;
            if (!_started)
            {
                _lastPosition = position;
                _started = true;
            }

            Vector3 delta = position - _lastPosition;
            _lastPosition = position;
            float horizontal = new Vector2(delta.x, delta.z).magnitude / dt;
            if (horizontal > 30f)
            {
                horizontal = 0f; // Teleport (respawn, portal): no sprint for one frame.
            }

            float follow = 1f - Mathf.Exp(-10f * dt);
            _speed = Mathf.Lerp(_speed, horizontal, follow);
            _verticalSpeed = Mathf.Lerp(_verticalSpeed, Mathf.Clamp(delta.y / dt, -20f, 20f), follow);
            _phase = Mathf.Repeat(_phase + _speed / strideLength * Mathf.PI * 2f * dt, Mathf.PI * 2f);
            _flinch = Mathf.MoveTowards(_flinch, 0f, dt * 4f);
            bool dead = combatant != null && !combatant.IsAlive;
            _death = Mathf.MoveTowards(_death, dead ? 1f : 0f, dt * (dead ? 1.8f : 4f));

            Pose();
        }

        private void Pose()
        {
            float amount = Mathf.Clamp01(_speed / fullSwingSpeed);
            float walk = Mathf.Clamp01(_speed / 0.4f);
            bool airborne = Mathf.Abs(_verticalSpeed) > 2.5f && _death <= 0f;
            float sin = Mathf.Sin(_phase);
            float time = Time.time;

            // Legs: thigh forward/back (negative X = forward), the knee bends while that leg swings forward (thigh angle falling).
            float swing = legSwing * Mathf.Lerp(0.45f, 1f, amount) * walk;
            float thighR = sin * swing;
            float thighL = -sin * swing;
            float kneeR = Mathf.Max(0f, -Mathf.Cos(_phase)) * swing * 1.3f;
            float kneeL = Mathf.Max(0f, Mathf.Cos(_phase)) * swing * 1.3f;
            if (airborne)
            {
                thighR = thighL = -35f;
                kneeR = kneeL = 55f;
            }

            Set(7, thighR, 0f, 0f);
            Set(8, kneeR, 0f, 0f);
            Set(9, thighL, 0f, 0f);
            Set(10, kneeL, 0f, 0f);

            // Hips bob twice per cycle, the body leans into the run, breathes when standing, flinches back when hit.
            if (pelvis != null)
            {
                float bob = -Mathf.Abs(sin) * 0.04f * walk * Mathf.Lerp(0.5f, 1f, amount);
                pelvis.localPosition = _pelvisRest + new Vector3(0f, bob, 0f);
            }

            float breathe = Mathf.Sin(time * 1.6f) * 1.2f * (1f - walk);
            Set(0, 0f, sin * 6f * walk, 0f);
            Set(1, 12f * amount + breathe - 14f * _flinch, -sin * 8f * walk, 0f);
            Set(2, -6f * amount + 10f * _flinch, 0f, 0f);

            // Arms: swing opposite to the legs, or reach for their targets.
            if (!Reach(upperArmRight, forearmRight, rightHandTarget, 1f))
            {
                Set(3, thighL * 0.8f, 0f, 4f);
                Set(4, -15f - 20f * amount, 0f, 0f);
            }

            if (!Reach(upperArmLeft, forearmLeft, leftHandTarget, -1f))
            {
                Set(5, thighR * 0.8f, 0f, -4f);
                Set(6, -15f - 20f * amount, 0f, 0f);
            }

            // Falling over backwards around the feet.
            transform.localRotation = Quaternion.Euler(-82f * Smooth(_death), 0f, 0f);
        }

        private bool Reach(Transform upper, Transform fore, Transform target, float side)
        {
            if (upper == null || fore == null || target == null || !target.gameObject.activeInHierarchy)
            {
                return false;
            }

            Vector3 shoulder = upper.position;
            float upperLength = Vector3.Distance(shoulder, fore.position);
            float lowerLength = handLength * transform.lossyScale.y;
            Vector3 toTarget = target.position - shoulder;
            float distance = Mathf.Clamp(toTarget.magnitude, Mathf.Abs(upperLength - lowerLength) + 0.01f, upperLength + lowerLength - 0.001f);
            Vector3 direction = toTarget.sqrMagnitude > 1e-6f ? toTarget.normalized : -transform.up;

            // The elbow points down, back and a little outward.
            Vector3 pole = transform.TransformDirection(new Vector3(0.35f * side, -0.6f, -1f)).normalized;
            Vector3 normal = Vector3.Cross(direction, pole);
            if (normal.sqrMagnitude < 1e-6f)
            {
                normal = transform.right;
            }

            normal.Normalize();
            float cosShoulder = (upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2f * upperLength * distance);
            float shoulderAngle = Mathf.Acos(Mathf.Clamp(cosShoulder, -1f, 1f)) * Mathf.Rad2Deg;
            Vector3 upperDirection = Quaternion.AngleAxis(shoulderAngle, normal) * direction;
            Vector3 elbow = shoulder + upperDirection * upperLength;
            Vector3 lowerDirection = (shoulder + direction * distance - elbow).normalized;

            upper.rotation = LimbRotation(upperDirection, normal);
            fore.rotation = LimbRotation(lowerDirection, normal);
            return true;
        }

        private static Quaternion LimbRotation(Vector3 along, Vector3 normal)
        {
            // The parts hang along their local −Y; +Z stays the side the elbow bends away from.
            Vector3 forward = Vector3.Cross(normal, -along);
            if (forward.sqrMagnitude < 1e-6f)
            {
                forward = Vector3.forward;
            }

            return Quaternion.LookRotation(forward, -along);
        }

        private void Set(int joint, float x, float y, float z)
        {
            Transform part = _joints[joint];
            if (part != null)
            {
                part.localRotation = _rest[joint] * Quaternion.Euler(x, y, z);
            }
        }

        private static float Smooth(float t)
        {
            return t * t * (3f - 2f * t);
        }

        private static Transform FindPart(Transform root, string name)
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
