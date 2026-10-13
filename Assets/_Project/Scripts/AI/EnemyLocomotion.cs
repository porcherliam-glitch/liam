using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Moves one enemy with its <see cref="CharacterController"/> as the brain's <see cref="EnemyIntent"/> asks: walk/run to
    /// a point, circle the target in a ring, back off, flee, lunge forward; simple obstacle avoidance with raycasts
    /// (ahead, then ±45° and ±90°), gravity, knockback, and turning (slower while telegraphing, GDD 03 9.5).
    /// </summary>
    /// <remarks>
    /// Plain C# helper of <see cref="EnemyController"/> (no MonoBehaviour), split off so the adapter stays readable.
    /// TODO (navigation step): replace the raycast steering with NavMeshAgent paths (architecture 10.6, 11.10).
    /// </remarks>
    public sealed class EnemyLocomotion
    {
        private const float KnockbackSeconds = 0.15f;
        private const float Gravity = 19.6f;
        private const float ProbeDistance = 1.2f;

        private static readonly float[] SteerAngles = { 45f, -45f, 90f, -90f };

        private readonly CharacterController _controller;
        private readonly Transform _transform;
        private readonly LayerMask _obstacles;
        private Vector3 _knockVelocity;
        private float _knockRemaining;
        private float _verticalVelocity;

        /// <summary>Creates the locomotion of one enemy.</summary>
        /// <param name="controller">Character controller of the enemy root.</param>
        /// <param name="obstacles">Layers to steer around (Environment).</param>
        public EnemyLocomotion(CharacterController controller, LayerMask obstacles)
        {
            _controller = controller;
            _transform = controller.transform;
            _obstacles = obstacles;
        }

        /// <summary>True if the last move found no free direction (counts as "unreachable" for the leash rule).</summary>
        public bool Blocked { get; private set; }

        /// <summary>Executes the intent for one frame.</summary>
        /// <param name="intent">Movement wish of the brain.</param>
        /// <param name="deltaTime">Local combat time (0 during hitstop: nothing moves).</param>
        /// <param name="turnRate">Turn rate in degrees per second.</param>
        public void Move(in EnemyIntent intent, float deltaTime, float turnRate)
        {
            if (!(deltaTime > 0f) || !_controller.enabled)
            {
                return;
            }

            Vector3 position = _transform.position;
            Vector3 desired = DesiredVelocity(intent, position);
            Blocked = false;
            if (intent.Mode != EnemyMoveMode.Lunge && desired.sqrMagnitude > 0.0001f)
            {
                desired = Steer(position, desired);
            }

            if (_knockRemaining > 0f)
            {
                desired = _knockVelocity;
                _knockRemaining -= deltaTime;
            }

            Turn(intent, desired, deltaTime, turnRate);
            if (_controller.isGrounded && _verticalVelocity < 0f)
            {
                _verticalVelocity = -2f;
            }
            else
            {
                _verticalVelocity -= Gravity * deltaTime;
            }

            _controller.Move((desired + Vector3.up * _verticalVelocity) * deltaTime);
        }

        /// <summary>Pushes the enemy away from a point (0.15 s).</summary>
        /// <param name="from">Position of the attacker.</param>
        /// <param name="distance">Distance in metres.</param>
        public void StartKnockback(Vector3 from, float distance)
        {
            if (!(distance > 0f))
            {
                return;
            }

            Vector3 away = _transform.position - from;
            away.y = 0f;
            if (away.sqrMagnitude < 0.0001f)
            {
                return;
            }

            _knockVelocity = away.normalized * (distance / KnockbackSeconds);
            _knockRemaining = KnockbackSeconds;
        }

        /// <summary>Clears knockback and falling speed (respawn).</summary>
        public void Reset()
        {
            _knockRemaining = 0f;
            _verticalVelocity = 0f;
            Blocked = false;
        }

        private Vector3 DesiredVelocity(in EnemyIntent intent, Vector3 position)
        {
            var destination = new Vector3(intent.Destination.X, position.y, intent.Destination.Z);
            Vector3 toDestination = destination - position;
            toDestination.y = 0f;
            switch (intent.Mode)
            {
                case EnemyMoveMode.Walk:
                case EnemyMoveMode.Run:
                    return toDestination.sqrMagnitude > 0.09f ? toDestination.normalized * intent.Speed : Vector3.zero;
                case EnemyMoveMode.Circle:
                    float distance = toDestination.magnitude;
                    if (distance <= 0.01f)
                    {
                        return Vector3.zero;
                    }

                    Vector3 radial = toDestination / distance;
                    Vector3 tangent = Vector3.Cross(Vector3.up, radial) * intent.CircleDirection;
                    Vector3 correction = radial * Mathf.Clamp(distance - intent.RingDistance, -1f, 1f);
                    return (tangent + correction).normalized * intent.Speed;
                case EnemyMoveMode.Retreat:
                case EnemyMoveMode.Flee:
                    return toDestination.sqrMagnitude > 0.0001f ? -toDestination.normalized * intent.Speed : Vector3.zero;
                case EnemyMoveMode.Lunge:
                    return _transform.forward * intent.Speed;
                default:
                    return Vector3.zero;
            }
        }

        private Vector3 Steer(Vector3 position, Vector3 desired)
        {
            // Simple obstacle avoidance on flat ground: probe ahead, then ±45° and ±90° (TODO: NavMesh paths).
            Vector3 origin = position + Vector3.up * 0.5f;
            if (!Physics.Raycast(origin, desired.normalized, ProbeDistance, _obstacles, QueryTriggerInteraction.Ignore))
            {
                return desired;
            }

            float[] angles = SteerAngles;
            for (int i = 0; i < angles.Length; i++)
            {
                Vector3 candidate = Quaternion.Euler(0f, angles[i], 0f) * desired;
                if (!Physics.Raycast(origin, candidate.normalized, ProbeDistance, _obstacles, QueryTriggerInteraction.Ignore))
                {
                    return candidate;
                }
            }

            Blocked = true;
            return Vector3.zero;
        }

        private void Turn(in EnemyIntent intent, Vector3 desired, float deltaTime, float turnRate)
        {
            float currentYaw = _transform.eulerAngles.y;
            float targetYaw = currentYaw;
            Vector3 position = _transform.position;
            if (intent.FaceTarget && intent.Mode != EnemyMoveMode.Flee)
            {
                targetYaw = CombatMath.YawOf(intent.Destination.X - position.x, intent.Destination.Z - position.z);
            }
            else if (desired.sqrMagnitude > 0.01f && intent.Mode != EnemyMoveMode.Lunge)
            {
                targetYaw = CombatMath.YawOf(desired.x, desired.z);
            }

            float yaw = CombatMath.MoveTowardsAngle(currentYaw, targetYaw, turnRate * deltaTime);
            _transform.rotation = Quaternion.Euler(0f, yaw, 0f);
        }
    }
}
