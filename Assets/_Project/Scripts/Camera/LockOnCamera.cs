using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Player;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.CameraSystem
{
    /// <summary>
    /// Lock-on camera <c>CM_LockOn</c> (architecture 11.2, GDD 03 2.1): a second <see cref="CinemachineCamera"/> with higher
    /// priority, <see cref="CinemachineThirdPersonFollow"/> behind the player and <see cref="CinemachineRotationComposer"/>
    /// aimed at a <see cref="CinemachineTargetGroup"/> of player and target, so both stay in the frame. Listens to
    /// <see cref="PlayerLockOn.TargetChanged"/> (local C# event): with a target the camera is enabled (the brain blends to
    /// it), without one it is disabled and the exploration camera takes over behind the player.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: <c>CM_LockOn</c>. Camera distance follows GDD 03 2.1: 4.5 + 0.25 × target height + 0.1 × distance,
    /// 4.5–7.0 m (<see cref="TargetingMath.LockOnCameraDistance"/>). While locked, the exploration camera's horizontal axis
    /// follows the player's facing, so releasing the lock does not jump.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class LockOnCamera : MonoBehaviour
    {
        [Tooltip("Lock-On des Spielers (Komponente am Spieler).")]
        [SerializeField] private PlayerLockOn lockOn = null;

        [Tooltip("Die Lock-On-Kamera (CinemachineCamera an CM_LockOn). Leer = Komponente am selben GameObject.")]
        [SerializeField] private CinemachineCamera lockOnCamera = null;

        [Tooltip("Third Person Follow der Lock-On-Kamera (Abstand). Leer = Komponente am selben GameObject.")]
        [SerializeField] private CinemachineThirdPersonFollow thirdPersonFollow = null;

        [Tooltip("Zielgruppe aus Spieler und Ziel (CinemachineTargetGroup), auf die die Kamera schaut.")]
        [SerializeField] private CinemachineTargetGroup targetGroup = null;

        [Tooltip("Punkt am Spieler für die Zielgruppe (CameraPivot).")]
        [SerializeField] private Transform playerMember = null;

        [Tooltip("Orbital Follow der Erkundungskamera CM_Explore (wird beim Lock-On hinter den Spieler gedreht).")]
        [SerializeField] private CinemachineOrbitalFollow exploreOrbital = null;

        [Tooltip("Gewicht des Spielers in der Zielgruppe.")]
        [Range(0.1f, 3f)] [SerializeField] private float playerWeight = 1f;

        [Tooltip("Gewicht des Ziels in der Zielgruppe.")]
        [Range(0.1f, 3f)] [SerializeField] private float targetWeight = 1f;

        [Tooltip("Radius des Ziels in Metern (Bildausschnitt).")]
        [Range(0.1f, 5f)] [SerializeField] private float targetRadius = 0.8f;

        private Combatant _target;

        private void Awake()
        {
            if (lockOnCamera == null)
            {
                TryGetComponent(out lockOnCamera);
            }

            if (thirdPersonFollow == null)
            {
                TryGetComponent(out thirdPersonFollow);
            }

            if (lockOn == null || lockOnCamera == null || targetGroup == null)
            {
                Log.Warning(LogCategory.Camera, "LockOnCamera on '" + name + "': lock-on, camera or target group is not assigned; lock-on camera is off.");
                enabled = false;
                return;
            }

            lockOnCamera.enabled = false;
        }

        private void OnEnable()
        {
            if (lockOn != null)
            {
                lockOn.TargetChanged += OnTargetChanged;
                OnTargetChanged(lockOn.Target);
            }
        }

        private void OnDisable()
        {
            if (lockOn != null)
            {
                lockOn.TargetChanged -= OnTargetChanged;
            }

            OnTargetChanged(null);
        }

        private void LateUpdate()
        {
            if (_target == null || playerMember == null)
            {
                return;
            }

            Vector3 player = playerMember.position;
            Vector3 target = _target.TargetPosition;
            float distance = Vector3.Distance(new Vector3(player.x, 0f, player.z), new Vector3(target.x, 0f, target.z));
            float height = Mathf.Max(0f, target.y - _target.transform.position.y) * 2f;
            if (thirdPersonFollow != null)
            {
                thirdPersonFollow.CameraDistance = TargetingMath.LockOnCameraDistance(height, distance);
            }

            if (exploreOrbital != null && lockOn != null)
            {
                float yaw = lockOn.transform.eulerAngles.y;
                exploreOrbital.HorizontalAxis.Value = exploreOrbital.HorizontalAxis.ClampValue(Mathf.DeltaAngle(0f, yaw));
            }
        }

        private void OnTargetChanged(Combatant target)
        {
            if (targetGroup == null || lockOnCamera == null)
            {
                return;
            }

            if (_target != null)
            {
                targetGroup.RemoveMember(_target.TargetTransform);
            }

            _target = target;
            if (target == null)
            {
                if (playerMember != null)
                {
                    targetGroup.RemoveMember(playerMember);
                }

                lockOnCamera.enabled = false;
                return;
            }

            if (playerMember != null && targetGroup.FindMember(playerMember) < 0)
            {
                targetGroup.AddMember(playerMember, playerWeight, 0.6f);
            }

            targetGroup.AddMember(target.TargetTransform, targetWeight, targetRadius);
            lockOnCamera.enabled = true;
        }
    }
}
