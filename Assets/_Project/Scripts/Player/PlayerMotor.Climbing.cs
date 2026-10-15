using Aetherfall.Core;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Climbing part of the motor (GDD 03 3.3, task list S48): walking or jumping into a <see cref="ClimbSurface"/> grabs it,
    /// the stick then moves the character in the plane of the wall (<see cref="ClimbModel"/>: speeds, stamina, climb jump,
    /// shaking and the fall). Sideways and downwards the character stays on the marked surface; at the top edge it climbs
    /// over (if the surface allows it), at the bottom it stands up again. Dodge (B) lets go.
    /// </summary>
    public sealed partial class PlayerMotor
    {
        /// <summary>How far in front of the capsule a wall can be grabbed (metres).</summary>
        public const float ClimbReach = 0.45f;

        /// <summary>Gap between the capsule and the wall while climbing (metres).</summary>
        public const float ClimbHoldGap = 0.06f;

        private const float ClimbStartInput = 0.5f;
        private const float ClimbStartAngle = 50f;
        private const float ClimbRegrabSeconds = 0.4f;
        private const float ClimbPushOff = 0.3f;
        private const float ClimbWallMaxNormalY = 0.6f;
        private const float ClimbLedgeMinNormalY = 0.7f;

        private readonly ClimbModel _climb = new ClimbModel();
        private ClimbSurface _climbSurface;
        private Vector3 _climbNormal;
        private float _climbYaw;
        private float _climbRegrab;
        private bool _climbNeedsLanding;
        private int _climbExitFrame = -1;

        /// <summary>True while the character hangs on a climbable surface.</summary>
        public bool IsClimbing => _climbSurface != null;

        /// <summary>The surface the character climbs on, or null.</summary>
        public ClimbSurface ClimbSurface => _climbSurface;

        /// <summary>True while the hands shake on the wall (stamina is out, the fall follows after 1 s).</summary>
        public bool IsClimbShaking => IsClimbing && _climb.IsShaking;

        /// <summary>Metres climbed since the grab (the hand pose alternates with it).</summary>
        public float ClimbDistance { get; private set; }

        /// <summary>How the last climb ended (for the tour and the UI).</summary>
        public ClimbExit LastClimbExit { get; private set; }

        /// <summary>
        /// True while climbing and in the frame the character let go: attacks, blocks, the dodge and the bow wait (the dodge
        /// button lets go, GDD 03 1.4 K4).
        /// </summary>
        public bool ClimbBlocksActions => IsClimbing || _climbExitFrame == Time.frameCount;

        private Vector3 CapsuleCenter => transform.TransformPoint(_controller.center);

        private float ClimbProbeDistance => _controller.radius + ClimbReach;

        private void TickClimbTimers(float deltaTime)
        {
            if (_climbRegrab > 0f)
            {
                _climbRegrab -= deltaTime;
            }

            if (_model.IsGrounded)
            {
                _climbNeedsLanding = false;
            }
        }

        private void TryStartClimb(in PlayerMovementInput input)
        {
            if (_climbRegrab > 0f || _climbNeedsLanding || _loadBlocksJump)
            {
                // GDD 03/04: heavily overloaded = no jumping and no climbing.
                return;
            }

            float magnitude = Mathf.Sqrt(input.MoveX * input.MoveX + input.MoveY * input.MoveY);
            if (magnitude < ClimbStartInput)
            {
                return;
            }

            // The same camera-relative direction as the movement model.
            float yaw = input.CameraYaw * Mathf.Deg2Rad;
            var forward = new Vector3(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));
            var right = new Vector3(forward.z, 0f, -forward.x);
            Vector3 direction = (forward * input.MoveY + right * input.MoveX) / magnitude;
            if (!ProbeClimbWall(CapsuleCenter, direction, out RaycastHit hit, out ClimbSurface surface))
            {
                return;
            }

            Vector3 normal = Flat(hit.normal);
            if (normal == Vector3.zero || Vector3.Angle(direction, -normal) > ClimbStartAngle)
            {
                return;
            }

            BeginClimb(surface, normal, hit);
        }

        private void BeginClimb(ClimbSurface surface, Vector3 normal, in RaycastHit hit)
        {
            _climbSurface = surface;
            _climbNormal = normal;
            _climbYaw = Mathf.Atan2(-normal.x, -normal.z) * Mathf.Rad2Deg;
            _climb.Begin();
            _model.Reset(_climbYaw);
            ClimbDistance = 0f;
            LastClimbExit = ClimbExit.None;
            transform.rotation = Quaternion.Euler(0f, _climbYaw, 0f);
            _controller.Move(-normal * (WallGap(CapsuleCenter, -normal, hit) - ClimbHoldGap));
            Log.Info(LogCategory.Player, "Climbing " + surface.Kind + " on '" + surface.name + "'.");
        }

        private void StepClimb(in PlayerMovementInput input, float deltaTime, bool locked)
        {
            Vector3 into = -_climbNormal;
            Vector3 center = CapsuleCenter;
            if (ProbeClimbWall(center, into, out RaycastHit hit, out ClimbSurface surface))
            {
                // Follow the wall around gentle bends and onto the next surface (ladder → rock → vines).
                _climbSurface = surface;
                Vector3 normal = Flat(hit.normal);
                if (normal != Vector3.zero)
                {
                    _climbNormal = normal;
                    into = -normal;
                    _climbYaw = Mathf.Atan2(into.x, into.z) * Mathf.Rad2Deg;
                }
            }
            else
            {
                // No wall at the chest any more: over the top edge, or the surface is gone.
                bool over = _climbSurface.AllowTopOut && TryClimbOver(into);
                EndClimb(over ? ClimbExit.TopOut : ClimbExit.Lost, over ? 0f : ClimbPushOff);
                return;
            }

            ResourcePool stamina = stats != null ? stats.Stamina : null;
            float staminaNow = stamina != null ? stamina.Current : float.MaxValue;
            // Locked (stagger, stun, freeze): hang without moving, the hang stamina still drains.
            bool fast = !locked && input.SprintHeld && !_loadBlocksSprint && !_senseSlow;
            bool jump = !locked && input.JumpPressed && !_loadBlocksJump;
            ClimbModel.StepResult step = _climb.Step(_climbSurface.Kind, _climbSurface.RestPoint, locked ? 0f : input.MoveX, locked ? 0f : input.MoveY,
                fast, jump, !locked && input.LetGoPressed, staminaNow, deltaTime);
            if (step.StaminaCost > 0f && stamina != null)
            {
                stamina.Spend(step.StaminaCost);
            }

            if (step.Outcome != ClimbOutcome.Climbing)
            {
                EndClimb(step.Outcome == ClimbOutcome.LetGo ? ClimbExit.LetGo : ClimbExit.Exhausted, ClimbPushOff);
                return;
            }

            Vector3 right = Vector3.Cross(Vector3.up, into);
            Vector3 side = right * step.Right;
            Vector3 up = Vector3.up * step.Up;
            Vector3 delta = side + up;
            if (delta.sqrMagnitude > 1e-8f && !HasClimbWall(center + delta, into))
            {
                if (step.Up > 0f && _climbSurface.AllowTopOut && !HasClimbWall(center + up, into) && TryClimbOver(into))
                {
                    EndClimb(ClimbExit.TopOut, 0f);
                    return;
                }

                // Stay on the marked surface: keep only the part of the movement that still has a wall.
                delta = HasClimbWall(center + up, into) ? up : HasClimbWall(center + side, into) ? side : Vector3.zero;
            }

            if (ProbeClimbWall(center, into, out hit, out _))
            {
                delta += into * (WallGap(center, into, hit) - ClimbHoldGap);
            }

            _controller.Move(delta);
            ClimbDistance += new Vector2(Vector3.Dot(delta, right), delta.y).magnitude;
            transform.rotation = Quaternion.Euler(0f, _climbYaw, 0f);
            if (step.Up < 0f && IsOnGround())
            {
                // Climbed down to the ground (not onto the top of the next climb surface): stand up.
                EndClimb(ClimbExit.Ground, 0.05f);
            }
        }

        private void EndClimb(ClimbExit exit, float pushOff)
        {
            Log.Info(LogCategory.Player, "Climbing ended: " + exit + ".");
            _climbSurface = null;
            LastClimbExit = exit;
            _climbExitFrame = Time.frameCount;
            _climbRegrab = ClimbRegrabSeconds;
            // After letting go or falling, the next grab needs solid ground first (no catching the same wall mid-fall).
            _climbNeedsLanding = exit == ClimbExit.LetGo || exit == ClimbExit.Exhausted || exit == ClimbExit.Lost;
            if (pushOff > 0f)
            {
                _controller.Move(_climbNormal * pushOff);
            }

            _model.Reset(_climbYaw);
        }

        /// <summary>Lets go of the wall at once (the character died on it): the body falls.</summary>
        public void DropFromWall()
        {
            if (IsClimbing)
            {
                EndClimb(ClimbExit.Lost, ClimbPushOff);
            }
        }

        private void CancelClimb()
        {
            _climbNeedsLanding = false;
            if (_climbSurface != null)
            {
                _climbSurface = null;
                LastClimbExit = ClimbExit.Lost;
            }
        }

        private bool TryClimbOver(Vector3 into)
        {
            // GDD 03 3.3: at the top edge the character pulls itself up onto the ledge in front of it.
            float height = _controller.height;
            float radius = _controller.radius;
            Vector3 feet = transform.position;
            Vector3 above = feet + Vector3.up * (height + 0.6f) + into * (radius + 0.5f);
            if (!Physics.Raycast(above, Vector3.down, out RaycastHit hit, height + 1.4f, groundLayers, QueryTriggerInteraction.Ignore) ||
                hit.normal.y < ClimbLedgeMinNormalY || hit.point.y < feet.y + 0.2f)
            {
                return false;
            }

            Vector3 stand = hit.point + Vector3.up * 0.02f;
            Vector3 bottom = stand + Vector3.up * (radius + 0.05f);
            Vector3 top = stand + Vector3.up * (height - radius);
            if (Physics.CheckCapsule(bottom, top, radius * 0.95f, groundLayers, QueryTriggerInteraction.Ignore))
            {
                return false;
            }

            _controller.enabled = false;
            transform.position = stand;
            _controller.enabled = true;
            return true;
        }

        private bool HasClimbWall(Vector3 center, Vector3 into)
        {
            return ProbeClimbWall(center, into, out _, out _);
        }

        private bool ProbeClimbWall(Vector3 origin, Vector3 direction, out RaycastHit hit, out ClimbSurface surface)
        {
            surface = null;
            // A thin ray from the body centre: it meets the flat faces of the surfaces (a sphere would catch the top edge of a
            // ladder with a slanted normal and stop the climb there).
            if (!Physics.Raycast(origin, direction, out hit, ClimbProbeDistance, groundLayers, QueryTriggerInteraction.Ignore) ||
                Mathf.Abs(hit.normal.y) > ClimbWallMaxNormalY)
            {
                return false;
            }

            surface = hit.collider.GetComponentInParent<ClimbSurface>();
            return surface != null && surface.isActiveAndEnabled;
        }

        private float WallGap(Vector3 center, Vector3 into, in RaycastHit hit)
        {
            return Vector3.Dot(hit.point - center, into) - _controller.radius;
        }

        private bool IsOnGround()
        {
            return CastDown(0.1f, out RaycastHit hitInfo, out float gap) && gap <= _controller.skinWidth + GroundedTolerance &&
                   hitInfo.normal.y >= ClimbLedgeMinNormalY && hitInfo.collider.GetComponentInParent<ClimbSurface>() == null;
        }

        private static Vector3 Flat(Vector3 normal)
        {
            normal.y = 0f;
            return normal.sqrMagnitude > 1e-6f ? normal.normalized : Vector3.zero;
        }
    }
}
