using System;
using Aetherfall.Core;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Moves the player character with a <see cref="CharacterController"/> (architecture 11.3) using the rules of
    /// <see cref="PlayerMovementModel"/>: camera-relative movement, walk/run/sprint/sneak, jump with coyote time and jump
    /// buffer, gravity, ground detection (isGrounded + sphere cast), turning towards the movement direction, sliding on
    /// too steep slopes. Moves only while the game state is <see cref="GameState.Playing"/>.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root (with <see cref="CharacterController"/> and <see cref="PlayerInputReader"/>). The
    /// menu "Aetherfall > Testgelaende erstellen" (German menu text) sets it up.</para>
    /// <para>Input arrives through <see cref="SubmitInput"/> (from <see cref="PlayerInputReader"/>, which runs earlier in the
    /// frame). Presses are kept until the motor consumes them, so none is lost if the order changes.</para>
    /// <para>Stamina: with a <see cref="CharacterStatsComponent"/> in the field "Stats" sprinting and jumping use its stamina
    /// pool (GDD 03 3.1/4.3, see <see cref="PlayerMovementModel"/>); without one the stamina is unlimited.</para>
    /// <para>Combat limits (attacks, blocking, dodge roll, lock-on strafing, local hitstop) arrive through
    /// <see cref="SetMovementOverride"/> from the player combat controller.</para>
    /// <para>TODO: animation parameters (Animator step), climbing, swimming, gliding.</para>
    /// </remarks>
    [RequireComponent(typeof(CharacterController))]
    [DisallowMultipleComponent]
    public sealed class PlayerMotor : MonoBehaviour
    {
        private const float ProbeLift = 0.1f;
        private const float ProbeRadiusFactor = 0.9f;
        private const float GroundedTolerance = 0.05f;

        [Tooltip("Bewegungswerte (Assets/_Project/Settings/Player/PlayerMovementSettings.asset). Pflichtfeld.")]
        [SerializeField] private PlayerMovementSettings settings = null;

        [Tooltip("Transform der Main Camera. Die Bewegung ist relativ zu ihrer Blickrichtung (Gier-Winkel). Leer = Weltachsen.")]
        [SerializeField] private Transform cameraTransform = null;

        [Tooltip("Werte der Figur mit dem Ausdauer-Pool (Sprinten 12/s, Sprung 10). Leer = unbegrenzte Ausdauer.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Layer, die als Boden zählen (Bodenprüfung per SphereCast). Der Spieler-Layer selbst sollte fehlen.")]
        [SerializeField] private LayerMask groundLayers = ~0;

        [Tooltip("So weit (in Metern) wird die Figur beim Hinabgehen von Treppen und Kanten wieder auf den Boden gezogen, statt kurz zu fallen.")]
        [Range(0f, 1f)]
        [SerializeField] private float groundSnapDistance = 0.35f;

        private CharacterController _controller;
        private PlayerMovementModel _model;
        private IGameStateService _gameState;
        private PlayerMovementInput _pendingInput;
        private PlayerMovementOverride _limits;
        private bool _frozen;
        private bool _warnedNoCamera;

        /// <summary>The movement model (read-only use: speed, gait, states for animation, UI and debug tools).</summary>
        public PlayerMovementModel Model => _model;

        /// <summary>True while the motor moves the character (services found, game state Playing).</summary>
        public bool IsActive => _model != null && _gameState != null && _gameState.Current == GameState.Playing;

        /// <summary>True while the character jumps or falls (see <see cref="PlayerMovementModel.IsAirborne"/>); false without model.</summary>
        public bool IsAirborne => _model != null && _model.IsAirborne;

        /// <summary>Passes this frame's movement commands. Presses (jump, sprint, sneak, walk toggle) accumulate until consumed.</summary>
        /// <param name="input">Commands from the input reader (camera yaw is filled in by the motor).</param>
        public void SubmitInput(in PlayerMovementInput input)
        {
            PlayerMovementInput merged = input;
            merged.JumpPressed |= _pendingInput.JumpPressed;
            merged.SprintPressed |= _pendingInput.SprintPressed;
            merged.SneakPressed |= _pendingInput.SneakPressed;
            merged.WalkTogglePressed |= _pendingInput.WalkTogglePressed;
            merged.SprintSneakShared |= _pendingInput.SprintSneakShared;
            _pendingInput = merged;
        }

        /// <summary>
        /// Passes the combat limits for the next movement step (attack lock, block speed, dodge/lunge velocity, facing,
        /// lock-on strafing) and whether the character is frozen by its local hitstop. Called every frame by the player
        /// combat controller before the motor runs; consumed by one step, so stale limits never stay.
        /// </summary>
        /// <param name="limits">Limits of this frame.</param>
        /// <param name="frozen">True while the local hitstop freezes the character (architecture 4.4: hitstop is local).</param>
        public void SetMovementOverride(in PlayerMovementOverride limits, bool frozen)
        {
            _limits = limits;
            _frozen = frozen;
        }

        /// <summary>Current pose (feet position and yaw) for saving.</summary>
        public PlayerPose CurrentPose
        {
            get
            {
                Vector3 position = transform.position;
                return new PlayerPose(position.x, position.y, position.z, transform.eulerAngles.y);
            }
        }

        /// <summary>
        /// Places the character at a pose (load). Disables the CharacterController for the move, so the position is not
        /// overridden, and stops all movement.
        /// </summary>
        /// <param name="pose">Feet position and yaw.</param>
        public void Teleport(in PlayerPose pose)
        {
            Teleport(new Vector3(pose.X, pose.Y, pose.Z), Quaternion.Euler(0f, pose.Yaw, 0f));
        }

        /// <summary>Places the character (spawn, load, fast travel) and stops all movement.</summary>
        /// <param name="position">New position of the character's root (feet).</param>
        /// <param name="rotation">New rotation; only the yaw is used.</param>
        public void Teleport(Vector3 position, Quaternion rotation)
        {
            float yaw = rotation.eulerAngles.y;
            bool controllerEnabled = _controller != null && _controller.enabled;
            if (controllerEnabled)
            {
                // A CharacterController overrides transform changes while enabled.
                _controller.enabled = false;
            }

            transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
            if (controllerEnabled)
            {
                _controller.enabled = true;
            }

            if (_model != null)
            {
                _model.Reset(yaw);
            }

            _pendingInput = default;
        }

        private void Awake()
        {
            if (!TryGetComponent(out _controller))
            {
                Log.Error(LogCategory.Player, "PlayerMotor on '" + name + "' needs a CharacterController.");
                enabled = false;
                return;
            }

            if (settings == null)
            {
                Log.Error(LogCategory.Player, "PlayerMotor on '" + name + "': the field 'Settings' is empty. Assign " +
                                              "Assets/_Project/Settings/Player/PlayerMovementSettings.asset (or run Aetherfall > Testgelände erstellen).");
                enabled = false;
                return;
            }

            PlayerMovementTuning tuning = settings.CreateTuning();
            string problem = tuning.Validate();
            if (problem.Length > 0)
            {
                Log.Error(LogCategory.Player, "PlayerMovementSettings '" + settings.name + "' are invalid: " + problem);
                enabled = false;
                return;
            }

            _controller.slopeLimit = tuning.ControllerSlopeLimit;
            _controller.stepOffset = Mathf.Min(tuning.StepOffset, _controller.height * 0.5f);
            ResourcePool stamina = null;
            if (stats != null)
            {
                stamina = stats.Stamina;
            }
            else
            {
                Log.Info(LogCategory.Player, "PlayerMotor on '" + name + "': no CharacterStatsComponent in the field 'Stats', stamina is unlimited.");
            }

            _model = new PlayerMovementModel(tuning, transform.eulerAngles.y, stamina);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerMotor could not resolve IGameStateService.");
            }
        }

        private void Update()
        {
            if (!IsActive)
            {
                // Outside of Playing (menus, pause, dialogue) the character stands still and presses are dropped.
                _pendingInput = default;
                return;
            }

            PlayerMovementOverride limits = _limits;
            bool frozen = _frozen;
            _limits = default;
            _frozen = false;
            if (frozen)
            {
                // Local hitstop: the character stands still for a few milliseconds; presses stay pending.
                return;
            }

            float deltaTime = Time.deltaTime;
            PlayerMovementInput input = _pendingInput;
            input.CameraYaw = GetCameraYaw();
            _pendingInput = default;

            GroundContact ground = ProbeGround();
            bool wasGrounded = _model.IsGrounded;
            MotionVector velocity = _model.Step(input, ground, deltaTime, limits);

            CollisionFlags flags = _controller.Move(new Vector3(velocity.X, velocity.Y, velocity.Z) * deltaTime);
            if ((flags & CollisionFlags.Above) != 0)
            {
                _model.NotifyCeilingHit();
            }

            if (wasGrounded && !_model.JumpedThisStep && !_controller.isGrounded && _model.IsGrounded)
            {
                SnapToGround();
            }

            transform.rotation = Quaternion.Euler(0f, _model.Yaw, 0f);
        }

        private float GetCameraYaw()
        {
            if (cameraTransform != null)
            {
                return cameraTransform.eulerAngles.y;
            }

            if (!_warnedNoCamera)
            {
                _warnedNoCamera = true;
                Log.Warning(LogCategory.Player, "PlayerMotor on '" + name + "': the field 'Camera Transform' is empty, movement uses the world axes.");
            }

            return 0f;
        }

        private GroundContact ProbeGround()
        {
            MotionVector normal = MotionVector.Up;
            bool hit = CastDown(groundSnapDistance, out RaycastHit hitInfo, out float hitGap);
            if (hit)
            {
                Vector3 hitNormal = hitInfo.normal;
                normal = new MotionVector(hitNormal.x, hitNormal.y, hitNormal.z);
            }

            bool grounded = _controller.isGrounded || (hit && hitGap <= _controller.skinWidth + GroundedTolerance);
            return new GroundContact(grounded, normal);
        }

        private void SnapToGround()
        {
            if (!CastDown(groundSnapDistance, out RaycastHit hitInfo, out float gap) ||
                Vector3.Angle(hitInfo.normal, Vector3.up) > _model.Tuning.ControllerSlopeLimit)
            {
                return;
            }

            _controller.Move(new Vector3(0f, -(gap + _controller.skinWidth), 0f));
        }

        private bool CastDown(float extraDistance, out RaycastHit hitInfo, out float gap)
        {
            float radius = _controller.radius * ProbeRadiusFactor;
            Vector3 bottomSphereCenter = transform.TransformPoint(_controller.center) +
                                         Vector3.up * (-_controller.height * 0.5f + _controller.radius);
            Vector3 origin = bottomSphereCenter + Vector3.up * ProbeLift;
            float distance = ProbeLift + (_controller.radius - radius) + extraDistance;
            if (Physics.SphereCast(origin, radius, Vector3.down, out hitInfo, distance, groundLayers, QueryTriggerInteraction.Ignore))
            {
                // Distance between the lowest point of the capsule and the ground below it.
                gap = Mathf.Max(0f, hitInfo.distance - ProbeLift - (_controller.radius - radius));
                return true;
            }

            gap = float.PositiveInfinity;
            return false;
        }
    }
}
