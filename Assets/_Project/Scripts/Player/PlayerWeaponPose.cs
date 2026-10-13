using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Procedural pose of the placeholder sword and shield while there are no animations: the sword swings along the
    /// attack time line (wind-up, hit, recovery; each combo step from another side, heavy from above, the 4th step as a
    /// thrust), is raised and trembles while charging, the shield comes up in front of the body while blocking (gold in the
    /// parry window via its renderer colour), both tuck in during a dodge, and wobble while staggered.
    /// </summary>
    /// <remarks>
    /// GameObject: the player root; <c>weaponPivot</c> is the "hand" holding the sword cube, <c>shieldPivot</c> the off hand
    /// with the shield cube. Pure presentation: reads <see cref="PlayerCombatController.StateMachine"/>, writes local
    /// rotations/positions in LateUpdate. TODO (animation step): replace with Animator and Animation Events.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerWeaponPose : MonoBehaviour
    {
        [Tooltip("Kampfsteuerung des Spielers. Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Drehpunkt der Schwerthand (Kind-Objekt mit dem Schwert-Quader).")]
        [SerializeField] private Transform weaponPivot = null;

        [Tooltip("Drehpunkt der Schildhand (Kind-Objekt mit dem Schild-Quader).")]
        [SerializeField] private Transform shieldPivot = null;

        [Tooltip("Renderer des Schilds: leuchtet golden, solange das Parierfenster offen ist.")]
        [SerializeField] private HitFlash shieldFlash = null;

        [Tooltip("Wie schnell die Pose der Ziel-Pose folgt (größer = härter).")]
        [Range(5f, 60f)] [SerializeField] private float followSharpness = 25f;

        private static readonly Vector3 RestEuler = new Vector3(60f, 10f, 0f);

        private Vector3 _weaponRestPosition;
        private Vector3 _shieldRestPosition;
        private bool _parryGlow;

        private void Awake()
        {
            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (weaponPivot != null)
            {
                _weaponRestPosition = weaponPivot.localPosition;
            }

            if (shieldPivot != null)
            {
                _shieldRestPosition = shieldPivot.localPosition;
            }
        }

        private void LateUpdate()
        {
            CombatStateMachine machine = combat != null ? combat.StateMachine : null;
            if (machine == null || weaponPivot == null)
            {
                return;
            }

            Vector3 weaponEuler = RestEuler;
            Vector3 weaponOffset = Vector3.zero;
            Vector3 shieldEuler = new Vector3(0f, -20f, 0f);
            Vector3 shieldOffset = Vector3.zero;
            float sharpness = followSharpness;

            switch (machine.State)
            {
                case CombatStateId.Attacking:
                case CombatStateId.Finisher:
                    PoseAttack(machine, ref weaponEuler, ref weaponOffset, ref sharpness);
                    break;
                case CombatStateId.Charging:
                    float tremble = machine.ChargeLevel * 2.5f * Mathf.Sin(Time.time * 60f);
                    weaponEuler = new Vector3(-120f + tremble, 15f, 0f);
                    weaponOffset = new Vector3(0f, 0.25f, -0.1f);
                    break;
                case CombatStateId.Blocking:
                    shieldEuler = new Vector3(0f, 0f, 0f);
                    shieldOffset = new Vector3(0.3f, 0.15f, 0.35f);
                    weaponEuler = new Vector3(40f, -30f, 0f);
                    sharpness = 40f;
                    break;
                case CombatStateId.Dodging:
                    weaponEuler = new Vector3(100f, 0f, 0f);
                    shieldOffset = new Vector3(0.15f, -0.1f, 0.1f);
                    break;
                case CombatStateId.Staggered:
                    float wobble = Mathf.Sin(Time.time * 30f) * 25f;
                    weaponEuler = new Vector3(60f, wobble, 30f);
                    shieldEuler = new Vector3(-30f, -40f + wobble, 0f);
                    break;
                case CombatStateId.Dead:
                    weaponEuler = new Vector3(120f, 0f, 60f);
                    break;
            }

            float blend = 1f - Mathf.Exp(-sharpness * Time.deltaTime);
            weaponPivot.localRotation = Quaternion.Slerp(weaponPivot.localRotation, Quaternion.Euler(weaponEuler), blend);
            weaponPivot.localPosition = Vector3.Lerp(weaponPivot.localPosition, _weaponRestPosition + weaponOffset, blend);
            if (shieldPivot != null)
            {
                shieldPivot.localRotation = Quaternion.Slerp(shieldPivot.localRotation, Quaternion.Euler(shieldEuler), blend);
                shieldPivot.localPosition = Vector3.Lerp(shieldPivot.localPosition, _shieldRestPosition + shieldOffset, blend);
            }

            bool glow = machine.IsParryWindowOpen;
            if (shieldFlash != null && glow != _parryGlow)
            {
                _parryGlow = glow;
                shieldFlash.SetTint(new Color(1f, 0.91f, 0.64f), glow ? 0.9f : 0f);
            }
        }

        private static void PoseAttack(CombatStateMachine machine, ref Vector3 euler, ref Vector3 offset, ref float sharpness)
        {
            AttackSpec attack = machine.CurrentAttack;
            if (attack == null)
            {
                return;
            }

            float elapsed = machine.AttackElapsed;
            float windup = Mathf.Max(0.01f, attack.WindupSeconds);
            float active = Mathf.Max(0.01f, attack.ActiveSeconds);
            Vector3 from;
            Vector3 to;
            Vector3 thrust = Vector3.zero;
            switch (attack.Kind)
            {
                case AttackKind.Light:
                    // Alternate sides per combo step: right to left, left to right, diagonal.
                    int step = machine.ComboStep;
                    if (step % 3 == 1)
                    {
                        from = new Vector3(10f, -110f, 0f);
                        to = new Vector3(15f, 80f, 0f);
                    }
                    else if (step % 3 == 2)
                    {
                        from = new Vector3(-50f, 60f, 0f);
                        to = new Vector3(60f, -50f, 0f);
                    }
                    else
                    {
                        from = new Vector3(10f, 110f, 0f);
                        to = new Vector3(15f, -80f, 0f);
                    }

                    break;
                case AttackKind.ComboFinisher:
                    from = new Vector3(5f, 0f, 0f);
                    to = new Vector3(5f, 0f, 0f);
                    thrust = new Vector3(0f, 0f, 0.6f);
                    break;
                case AttackKind.Counter:
                    from = new Vector3(-40f, 80f, 0f);
                    to = new Vector3(50f, -60f, 0f);
                    break;
                default:
                    // Heavy, sprint, jump, finisher: from above.
                    from = new Vector3(-120f, 0f, 0f);
                    to = new Vector3(60f, 0f, 0f);
                    break;
            }

            if (elapsed < windup)
            {
                float t = elapsed / windup;
                euler = Vector3.Lerp(RestEuler, from, t);
                offset = Vector3.Lerp(Vector3.zero, -thrust * 0.3f, t);
            }
            else if (elapsed < windup + active)
            {
                float t = (elapsed - windup) / active;
                euler = Vector3.Lerp(from, to, t);
                offset = Vector3.Lerp(-thrust * 0.3f, thrust, t);
                sharpness = 80f;
            }
            else
            {
                euler = to;
                offset = thrust;
                sharpness = 12f;
            }
        }
    }
}
