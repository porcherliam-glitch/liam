using System;
using Aetherfall.Stats;

namespace Aetherfall.Player
{
    /// <summary>
    /// The movement rules of the player (GDD 03 3.1) as pure logic: camera-relative direction, gait and target speed
    /// (analog stick tiers), acceleration, sprint/sneak/walk states, jump with coyote time and jump buffer, gravity, air
    /// control and sliding on steep slopes. <see cref="PlayerMotor"/> feeds it once per frame and moves the
    /// CharacterController with the returned velocity.
    /// </summary>
    /// <remarks>
    /// <para>No UnityEngine types or calls: vectors are <see cref="MotionVector"/>, all math is done on floats with
    /// <see cref="Math"/>, so the model runs (and is tested) outside of Unity.</para>
    /// <para>Coordinates: Y is up, yaw 0 looks along +Z, positive yaw turns right (clockwise seen from above), like Unity.</para>
    /// <para>Stamina (GDD 03 3.1 and 4.3) with a <see cref="ResourcePool"/>: sprinting costs 12 per second and starts only
    /// with at least 10 and not while exhausted; at 0 the sprint ends (the pool then counts as exhausted for 1.2 s). A
    /// jump needs more than 0 and costs 10 (never below 0). Without a pool the stamina is unlimited. The pool's owner
    /// ticks the regeneration (25 per second after 0.8 s).
    /// Combat (dodge roll, attack lunge, blocking speed, lock-on strafing) comes in through <see cref="PlayerMovementOverride"/>.
    /// The stat <c>MoveSpeed</c> scales the ground speeds (<see cref="SpeedMultiplier"/>); overload limits (max. speed, no
    /// sprint, no jump) arrive as limits from the motor.
    /// TODO (later steps): swimming, gliding, fall damage (climbing: ClimbModel and the motor).</para>
    /// </remarks>
    public sealed class PlayerMovementModel
    {
        private const float InputEpsilon = PlayerMovementMath.InputEpsilon;

        private readonly PlayerMovementTuning _tuning;
        private readonly ResourcePool _stamina;
        private float _velocityX;
        private float _velocityY;
        private float _velocityZ;
        private float _slideSpeed;
        private float _slideDirX;
        private float _slideDirY;
        private float _slideDirZ;
        private float _groundNormalX;
        private float _groundNormalY = 1f;
        private float _groundNormalZ;
        private float _timeSinceGrounded = float.PositiveInfinity;
        private float _timeSinceJumpPressed = float.PositiveInfinity;
        private bool _jumpConsumed;
        private bool _hasAirReference;
        private float _airReferenceX;
        private float _airReferenceZ;
        private float _yaw;
        private float _speedMultiplier = 1f;

        /// <summary>Creates the model standing still, facing <paramref name="yaw"/>, not yet grounded.</summary>
        /// <param name="tuning">Tuning values (GDD 03 3.1); validated.</param>
        /// <param name="yaw">Initial facing in degrees.</param>
        /// <param name="stamina">Stamina pool for sprint and jump costs; null = unlimited stamina.</param>
        /// <exception cref="ArgumentException">A tuning value is out of range.</exception>
        public PlayerMovementModel(PlayerMovementTuning tuning, float yaw = 0f, ResourcePool stamina = null)
        {
            _stamina = stamina;
            _tuning = tuning ?? throw new ArgumentNullException(nameof(tuning));
            string problem = tuning.Validate();
            if (problem.Length > 0)
            {
                throw new ArgumentException("Invalid movement tuning: " + problem, nameof(tuning));
            }

            _yaw = PlayerMovementMath.NormalizeAngle(yaw);
        }

        /// <summary>The tuning values in use.</summary>
        public PlayerMovementTuning Tuning => _tuning;

        /// <summary>Stamina pool for sprint and jump costs, or null (unlimited stamina).</summary>
        public ResourcePool Stamina => _stamina;

        /// <summary>
        /// True if a sprint may start now: no pool, or at least <see cref="PlayerMovementTuning.SprintStartMinimumStamina"/>
        /// stamina and not exhausted (GDD 03 3.1, 4.3).
        /// </summary>
        public bool CanStartSprint => _stamina == null ||
                                      (!_stamina.IsExhausted && _stamina.HasAtLeast(Math.Max(_tuning.SprintStartMinimumStamina, float.Epsilon)));

        /// <summary>Velocity of the last step in m/s (what the motor moved with, including sliding).</summary>
        public MotionVector Velocity { get; private set; }

        /// <summary>Horizontal speed controlled by the player in m/s (without sliding).</summary>
        public float HorizontalSpeed => (float)Math.Sqrt(_velocityX * _velocityX + _velocityZ * _velocityZ);

        /// <summary>Facing of the character in degrees [0, 360).</summary>
        public float Yaw => _yaw;

        /// <summary>True if the character stood on walkable ground in the last step.</summary>
        public bool IsGrounded { get; private set; }

        /// <summary>True if the character slid down a too steep slope in the last step.</summary>
        public bool IsSliding { get; private set; }

        /// <summary>
        /// True while the character is in the air: at once after a jump (or a teleport until the next step finds ground),
        /// after walking off an edge only once the coyote time has passed (no flicker on stairs). Sliding on a too steep
        /// slope does not count. Used for the save lock "falling, jumping" (architecture 9.8, GDD 05 5.2).
        /// </summary>
        public bool IsAirborne => !IsGrounded && !IsSliding && _timeSinceGrounded > _tuning.CoyoteTime;

        /// <summary>True in the step in which a jump started.</summary>
        public bool JumpedThisStep { get; private set; }

        /// <summary>Sprint state (toggle or hold).</summary>
        public bool IsSprinting { get; private set; }

        /// <summary>Sneak state (toggle).</summary>
        public bool IsSneaking { get; private set; }

        /// <summary>Walk mode (Caps Lock toggle): full input walks instead of running.</summary>
        public bool IsWalkMode { get; private set; }

        /// <summary>Gait of the last step.</summary>
        public PlayerGait Gait { get; private set; }

        /// <summary>
        /// Factor on the ground speeds from the stat <c>MoveSpeed</c> (1 = 100 %; equipment "+% Bewegungstempo", overload
        /// −40 %/−60 %, GDD 03 10.3, GDD 04 1.3). Set by the motor every frame; never below 0.
        /// </summary>
        public float SpeedMultiplier
        {
            get => _speedMultiplier;
            set => _speedMultiplier = value > 0f ? value : 0f;
        }

        /// <summary>Stops all movement and sets the facing (teleport, respawn). The next step starts airborne.</summary>
        /// <param name="yaw">New facing in degrees.</param>
        public void Reset(float yaw)
        {
            _velocityX = _velocityY = _velocityZ = 0f;
            _slideSpeed = 0f;
            _timeSinceGrounded = float.PositiveInfinity;
            _timeSinceJumpPressed = float.PositiveInfinity;
            _jumpConsumed = false;
            _hasAirReference = false;
            _yaw = PlayerMovementMath.NormalizeAngle(yaw);
            Velocity = MotionVector.Zero;
            IsGrounded = false;
            IsSliding = false;
            JumpedThisStep = false;
            IsSprinting = false;
            Gait = PlayerGait.Idle;
        }

        /// <summary>The character hit a ceiling: stops the upward movement.</summary>
        public void NotifyCeilingHit()
        {
            if (_velocityY > 0f)
            {
                _velocityY = 0f;
            }
        }

        /// <summary>Advances the movement by one frame.</summary>
        /// <param name="input">Commands of this frame.</param>
        /// <param name="ground">Ground below the character before this step.</param>
        /// <param name="deltaTime">Frame time in seconds; 0 or less changes nothing.</param>
        /// <returns>
        /// Velocity to move the character with this frame (m/s): moving by it times <paramref name="deltaTime"/> gives the
        /// exact displacement of the step. In the air its Y is the mean vertical speed of the step, not the speed at its end.
        /// </returns>
        public MotionVector Step(in PlayerMovementInput input, in GroundContact ground, float deltaTime)
        {
            return Step(input, ground, deltaTime, default);
        }

        /// <summary>
        /// Advances the movement by one frame under the limits of the combat system (<see cref="PlayerMovementOverride"/>):
        /// locked locomotion, speed limit, forced velocity (dodge, lunge, knockback), facing and lock-on strafing.
        /// </summary>
        /// <param name="input">Commands of this frame.</param>
        /// <param name="ground">Ground below the character before this step.</param>
        /// <param name="deltaTime">Frame time in seconds; 0 or less changes nothing.</param>
        /// <param name="limits">Combat limits; the default value changes nothing.</param>
        /// <returns>Velocity to move the character with this frame (m/s), see the overload without limits.</returns>
        public MotionVector Step(in PlayerMovementInput input, in GroundContact ground, float deltaTime, in PlayerMovementOverride limits)
        {
            JumpedThisStep = false;
            if (!(deltaTime > 0f))
            {
                return Velocity;
            }

            float dt = deltaTime;
            MotionVector direction = PlayerMovementMath.CameraRelativeDirection(input.MoveX, input.MoveY, input.CameraYaw);
            float magnitude = (float)Math.Sqrt(direction.X * direction.X + direction.Z * direction.Z);
            bool locked = limits.LockLocomotion || limits.HasForcedVelocity;
            bool hasInput = magnitude > InputEpsilon && !locked;

            UpdateStance(input, magnitude);
            if (limits.BlockSprint || locked)
            {
                IsSprinting = false;
            }

            if (limits.BlockJump || locked)
            {
                // No jump in attacks, dodges and while blocking; a buffered press does not fire afterwards.
                _timeSinceJumpPressed = float.PositiveInfinity;
            }

            // Ground classification. While rising from a jump the ground below is ignored.
            float slopeAngle = ground.IsGrounded ? PlayerMovementMath.SlopeAngle(ground.Normal) : 90f;
            bool touchesGround = ground.IsGrounded && !(_velocityY > 0f);
            bool stable = touchesGround && slopeAngle <= _tuning.SlideStartAngle;
            bool sliding = touchesGround && !stable;
            if (touchesGround)
            {
                StoreGroundNormal(ground.Normal);
            }

            if (stable)
            {
                _timeSinceGrounded = 0f;
                _jumpConsumed = false;
            }
            else
            {
                _timeSinceGrounded += dt;
            }

            // Jump buffer and coyote time (GDD 03 3.1: 0.15 s / 0.12 s).
            _timeSinceJumpPressed = input.JumpPressed && !limits.BlockJump && !locked ? 0f : _timeSinceJumpPressed + dt;
            // A jump needs stamina above 0 and costs JumpStaminaCost, never more than what is left (GDD 03 4.3).
            bool canJump = !_jumpConsumed && !sliding && _timeSinceGrounded <= _tuning.CoyoteTime &&
                           (_stamina == null || !_stamina.IsEmpty);
            if (canJump && _timeSinceJumpPressed <= _tuning.JumpBufferTime)
            {
                if (_stamina != null)
                {
                    _stamina.Spend(_tuning.JumpStaminaCost);
                }

                _velocityY = PlayerMovementMath.JumpVelocity(_tuning.JumpHeight, _tuning.Gravity * _tuning.RisingGravityScale);
                _timeSinceJumpPressed = float.PositiveInfinity;
                _timeSinceGrounded = float.PositiveInfinity;
                _jumpConsumed = true;
                JumpedThisStep = true;
                stable = false;
                sliding = false;
            }

            Gait = PlayerGaitRules.ResolveGait(hasInput ? magnitude : 0f, IsSprinting, IsSneaking, IsWalkMode, _tuning.RunInputThreshold);
            float speed = PlayerGaitRules.TargetSpeed(Gait, magnitude, _tuning);
            bool strafing = limits.Strafe && limits.HasFacing && Gait != PlayerGait.Sprint;
            if (strafing && hasInput)
            {
                speed = Math.Min(speed, PlayerMovementMath.StrafeSpeedCap(direction.X / magnitude, direction.Z / magnitude, limits.FacingYaw,
                    _tuning.RunSpeed, _tuning.StrafeSideSpeed, _tuning.StrafeBackSpeed));
            }

            speed *= _speedMultiplier;
            if (limits.SpeedLimit > 0f)
            {
                speed = Math.Min(speed, limits.SpeedLimit);
            }

            if (Gait == PlayerGait.Sprint && _stamina != null)
            {
                // 12 stamina per second while sprinting; at 0 the sprint ends (and the pool is exhausted for 1.2 s).
                _stamina.Spend(_tuning.SprintStaminaPerSecond * dt);
                if (_stamina.IsEmpty)
                {
                    IsSprinting = false;
                }
            }
            float targetX = hasInput ? direction.X / magnitude * speed : 0f;
            float targetZ = hasInput ? direction.Z / magnitude * speed : 0f;

            if (limits.HasForcedVelocity)
            {
                // Dodge roll, attack lunge, knockback: the combat system sets the horizontal velocity directly.
                _velocityX = limits.ForcedVelocityX;
                _velocityZ = limits.ForcedVelocityZ;
                if (stable)
                {
                    CaptureAirReference();
                }
            }
            else if (stable || JumpedThisStep)
            {
                AccelerateOnGround(targetX, targetZ, dt);
                CaptureAirReference();
            }
            else if (hasInput)
            {
                AccelerateInAir(direction.X / magnitude, direction.Z / magnitude, speed, dt);
            }

            if (sliding)
            {
                Slide(dt);
            }
            else if (_slideSpeed > 0f)
            {
                // Leaving a slide: keep its momentum as normal velocity.
                _velocityX += _slideDirX * _slideSpeed;
                _velocityY += _slideDirY * _slideSpeed;
                _velocityZ += _slideDirZ * _slideSpeed;
                _slideSpeed = 0f;
            }

            float outY;
            if (stable)
            {
                // Follow the ground plane (up and down slopes) and press lightly onto it.
                _velocityY = 0f;
                outY = -(_velocityX * _groundNormalX + _velocityZ * _groundNormalZ) / Math.Max(0.1f, _groundNormalY) - _tuning.GroundStickSpeed;
            }
            else if (sliding)
            {
                _velocityY = 0f;
                outY = _slideDirY * _slideSpeed - _tuning.GroundStickSpeed;
            }
            else
            {
                outY = IntegrateAirborne(dt);
            }

            // Sprinting in lock-on turns towards the movement direction (strafing ends while sprinting).
            bool useFacing = limits.HasFacing && !(limits.Strafe && !strafing && hasInput);
            if (useFacing)
            {
                float facingRate = limits.FacingTurnRate > 0f ? limits.FacingTurnRate : _tuning.TurnRate;
                _yaw = PlayerMovementMath.MoveTowardsAngle(_yaw, limits.FacingYaw, facingRate * dt);
            }
            else if (hasInput)
            {
                float targetYaw = PlayerMovementMath.YawOf(direction.X, direction.Z);
                float turnRate = Gait == PlayerGait.Sprint ? _tuning.SprintTurnRate : _tuning.TurnRate;
                _yaw = PlayerMovementMath.MoveTowardsAngle(_yaw, targetYaw, turnRate * dt);
            }

            IsGrounded = stable;
            IsSliding = sliding;

            float outX = _velocityX;
            float outZ = _velocityZ;
            if (sliding)
            {
                outX += _slideDirX * _slideSpeed;
                outZ += _slideDirZ * _slideSpeed;
            }

            Velocity = new MotionVector(outX, outY, outZ);
            return Velocity;
        }

        private float IntegrateAirborne(float dt)
        {
            // Exact for gravity that is constant per phase: the displacement uses the mean velocity of the step, and a step
            // that passes the apex is split there (rising and falling gravity differ). Moving with the end velocity instead
            // (semi-implicit Euler) loses about v0 * dt / 2 of jump height, so the jump would be lower at low frame rates.
            float velocity = _velocityY;
            float displacement = 0f;
            float remaining = dt;
            if (velocity > 0f)
            {
                float rising = _tuning.Gravity * _tuning.RisingGravityScale;
                float apexTime = velocity / rising;
                if (apexTime >= remaining)
                {
                    float end = velocity - rising * remaining;
                    _velocityY = end;
                    return 0.5f * (velocity + end);
                }

                displacement = 0.5f * velocity * apexTime;
                remaining -= apexTime;
                velocity = 0f;
            }

            displacement += Fall(ref velocity, remaining);
            _velocityY = velocity;
            return displacement / dt;
        }

        private float Fall(ref float velocity, float time)
        {
            // Falling gravity up to the highest fall speed; returns the displacement (≤ 0) over time.
            float falling = _tuning.Gravity * _tuning.FallingGravityScale;
            float maxFall = _tuning.MaxFallSpeed;
            if (velocity <= -maxFall)
            {
                velocity = -maxFall;
                return -maxFall * time;
            }

            float end = velocity - falling * time;
            if (end >= -maxFall)
            {
                float displacement = 0.5f * (velocity + end) * time;
                velocity = end;
                return displacement;
            }

            float accelerating = (velocity + maxFall) / falling;
            float result = 0.5f * (velocity - maxFall) * accelerating - maxFall * (time - accelerating);
            velocity = -maxFall;
            return result;
        }

        private void UpdateStance(in PlayerMovementInput input, float magnitude)
        {
            if (input.WalkTogglePressed)
            {
                IsWalkMode = !IsWalkMode;
            }

            bool fastEnough = magnitude >= _tuning.RunInputThreshold;
            if (input.SprintToggleMode)
            {
                if (input.SprintSneakShared && (input.SprintPressed || input.SneakPressed))
                {
                    // One button (L3), two meanings (GDD 03 1.3 K3).
                    if (fastEnough)
                    {
                        SetSprinting(!IsSprinting);
                    }
                    else
                    {
                        SetSneaking(!IsSneaking);
                    }
                }
                else
                {
                    if (input.SprintPressed)
                    {
                        SetSprinting(!IsSprinting);
                    }

                    if (input.SneakPressed)
                    {
                        SetSneaking(!IsSneaking);
                    }
                }

                // A toggled sprint ends as soon as the stick falls below the run threshold.
                if (IsSprinting && !fastEnough)
                {
                    IsSprinting = false;
                }
            }
            else
            {
                if (input.SneakPressed)
                {
                    SetSneaking(!IsSneaking);
                }

                bool sprint = input.SprintHeld && magnitude > InputEpsilon;
                if (sprint != IsSprinting)
                {
                    SetSprinting(sprint);
                }
            }
        }

        private void SetSprinting(bool sprinting)
        {
            if (sprinting && !IsSprinting && !CanStartSprint)
            {
                // Not enough stamina (below 10) or exhausted: the sprint does not start (GDD 03 3.1, 4.3).
                return;
            }

            IsSprinting = sprinting;
            if (sprinting)
            {
                IsSneaking = false;
            }
        }

        private void SetSneaking(bool sneaking)
        {
            IsSneaking = sneaking;
            if (sneaking)
            {
                IsSprinting = false;
            }
        }

        private void AccelerateOnGround(float targetX, float targetZ, float dt)
        {
            float currentSquared = _velocityX * _velocityX + _velocityZ * _velocityZ;
            float targetSquared = targetX * targetX + targetZ * targetZ;
            float rate = targetSquared >= currentSquared ? _tuning.GroundAcceleration : _tuning.GroundDeceleration;
            MoveHorizontalTowards(targetX, targetZ, rate * dt);
        }

        private void AccelerateInAir(float dirX, float dirZ, float speed, float dt)
        {
            // Keep the speed the character already has along the input direction (a sprint jump is not slowed down).
            float along = _velocityX * dirX + _velocityZ * dirZ;
            float targetSpeed = Math.Max(speed, along);
            float targetX = dirX * targetSpeed;
            float targetZ = dirZ * targetSpeed;

            // No reversal (GDD 03 3.1): the part of the target that points against the take-off direction is removed, so
            // the player can steer and brake down to zero along it, but never fly back. A standing jump has no reference.
            if (_hasAirReference)
            {
                float backwards = targetX * _airReferenceX + targetZ * _airReferenceZ;
                if (backwards < 0f)
                {
                    targetX -= backwards * _airReferenceX;
                    targetZ -= backwards * _airReferenceZ;
                }
            }

            MoveHorizontalTowards(targetX, targetZ, _tuning.GroundAcceleration * _tuning.AirControl * dt);
        }

        private void CaptureAirReference()
        {
            float speed = HorizontalSpeed;
            _hasAirReference = speed > InputEpsilon;
            if (_hasAirReference)
            {
                _airReferenceX = _velocityX / speed;
                _airReferenceZ = _velocityZ / speed;
            }
        }

        private void MoveHorizontalTowards(float targetX, float targetZ, float maxDelta)
        {
            float deltaX = targetX - _velocityX;
            float deltaZ = targetZ - _velocityZ;
            float distance = (float)Math.Sqrt(deltaX * deltaX + deltaZ * deltaZ);
            if (distance <= maxDelta || distance < 1e-6f)
            {
                _velocityX = targetX;
                _velocityZ = targetZ;
                return;
            }

            _velocityX += deltaX / distance * maxDelta;
            _velocityZ += deltaZ / distance * maxDelta;
        }

        private void Slide(float dt)
        {
            // Downhill direction = gravity projected onto the slope plane: d = down - (down·n) n.
            float nx = _groundNormalX;
            float ny = _groundNormalY;
            float nz = _groundNormalZ;
            float dx = ny * nx;
            float dy = -1f + ny * ny;
            float dz = ny * nz;
            float length = (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
            if (length < 1e-5f)
            {
                return;
            }

            _slideDirX = dx / length;
            _slideDirY = dy / length;
            _slideDirZ = dz / length;

            float sinSlope = (float)Math.Sqrt(Math.Max(0f, 1f - ny * ny));
            _slideSpeed = Math.Min(_tuning.MaxSlideSpeed, _slideSpeed + _tuning.Gravity * sinSlope * dt);

            // The player cannot walk up the slope: remove the uphill part of the controlled velocity.
            float horizontalLength = (float)Math.Sqrt(_slideDirX * _slideDirX + _slideDirZ * _slideDirZ);
            if (horizontalLength > 1e-5f)
            {
                float downhillX = _slideDirX / horizontalLength;
                float downhillZ = _slideDirZ / horizontalLength;
                float along = _velocityX * downhillX + _velocityZ * downhillZ;
                if (along < 0f)
                {
                    _velocityX -= along * downhillX;
                    _velocityZ -= along * downhillZ;
                }
            }
        }

        private void StoreGroundNormal(MotionVector normal)
        {
            float length = normal.Magnitude;
            if (length < 1e-6f)
            {
                _groundNormalX = 0f;
                _groundNormalY = 1f;
                _groundNormalZ = 0f;
                return;
            }

            _groundNormalX = normal.X / length;
            _groundNormalY = normal.Y / length;
            _groundNormalZ = normal.Z / length;
        }
    }
}
