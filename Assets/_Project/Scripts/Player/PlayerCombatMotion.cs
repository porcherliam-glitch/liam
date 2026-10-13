using System;
using Aetherfall.Combat;

namespace Aetherfall.Player
{
    /// <summary>
    /// Turns the movement limits of the combat state machine into a <see cref="PlayerMovementOverride"/> for the motor:
    /// lock-on strafing towards the target, slowed while blocking, locked and turned towards the attack direction while
    /// attacking, forced velocity for dodge rolls, back steps and attack lunges, and a short knockback after hits.
    /// </summary>
    /// <remarks>Pure logic of <see cref="PlayerCombatController"/> (no UnityEngine calls), tested in EditMode.</remarks>
    public sealed class PlayerCombatMotion
    {
        /// <summary>Turn rate towards the attack direction in degrees per second.</summary>
        public const float AttackTurnRate = 1440f;

        /// <summary>Turn rate towards the lock-on target in degrees per second.</summary>
        public const float LockOnTurnRate = 720f;

        private float _knockbackRemaining;
        private float _knockbackX;
        private float _knockbackZ;

        /// <summary>Creates the helper.</summary>
        /// <param name="knockbackSeconds">Duration of a knockback.</param>
        public PlayerCombatMotion(float knockbackSeconds = 0.15f)
        {
            KnockbackSeconds = knockbackSeconds;
        }

        /// <summary>Duration of a knockback in seconds.</summary>
        public float KnockbackSeconds { get; set; }

        /// <summary>Direction of the running attack (yaw in degrees), set when the attack starts.</summary>
        public float AttackYaw { get; set; }

        /// <summary>X part of the normalized dodge direction.</summary>
        public float DodgeDirectionX { get; private set; }

        /// <summary>Z part of the normalized dodge direction.</summary>
        public float DodgeDirectionZ { get; private set; }

        /// <summary>True while a knockback pushes the character.</summary>
        public bool IsKnockedBack => _knockbackRemaining > 0f;

        /// <summary>
        /// Sets the dodge direction: the (camera-relative) movement direction for a roll, or straight backwards from the
        /// facing for a back step (no movement input).
        /// </summary>
        /// <param name="moveX">World X of the movement direction (any length).</param>
        /// <param name="moveZ">World Z of the movement direction (any length).</param>
        /// <param name="facingYaw">Current facing of the character.</param>
        public void SetDodgeDirection(float moveX, float moveZ, float facingYaw)
        {
            float length = (float)Math.Sqrt(moveX * moveX + moveZ * moveZ);
            if (length > 0.01f)
            {
                DodgeDirectionX = moveX / length;
                DodgeDirectionZ = moveZ / length;
                return;
            }

            double radians = facingYaw * (Math.PI / 180.0);
            DodgeDirectionX = -(float)Math.Sin(radians);
            DodgeDirectionZ = -(float)Math.Cos(radians);
        }

        /// <summary>Pushes the character away from the attacker by the given distance within <see cref="KnockbackSeconds"/>.</summary>
        /// <param name="fromX">Attacker X.</param>
        /// <param name="fromZ">Attacker Z.</param>
        /// <param name="x">Own X.</param>
        /// <param name="z">Own Z.</param>
        /// <param name="distance">Distance in metres.</param>
        /// <returns>True if a knockback started.</returns>
        public bool StartKnockback(float fromX, float fromZ, float x, float z, float distance)
        {
            float dx = x - fromX;
            float dz = z - fromZ;
            float length = (float)Math.Sqrt(dx * dx + dz * dz);
            if (!(distance > 0f) || length < 0.01f || !(KnockbackSeconds > 0f))
            {
                return false;
            }

            float speed = distance / KnockbackSeconds;
            _knockbackX = dx / length * speed;
            _knockbackZ = dz / length * speed;
            _knockbackRemaining = KnockbackSeconds;
            return true;
        }

        /// <summary>Advances the knockback.</summary>
        /// <param name="deltaTime">Local combat time.</param>
        public void Tick(float deltaTime)
        {
            if (_knockbackRemaining > 0f && deltaTime > 0f)
            {
                _knockbackRemaining -= deltaTime;
            }
        }

        /// <summary>Ends a running knockback (death, respawn).</summary>
        public void Clear()
        {
            _knockbackRemaining = 0f;
        }

        /// <summary>Builds the movement limits of this frame.</summary>
        /// <param name="movement">Movement limits of the combat state.</param>
        /// <param name="state">Combat state.</param>
        /// <param name="isRoll">True if the current dodge is a roll (not a back step).</param>
        /// <param name="hasLockOnTarget">True while a target is locked.</param>
        /// <param name="lockOnYaw">Direction to the locked target (yaw in degrees).</param>
        /// <returns>The limits for <see cref="PlayerMotor.SetMovementOverride"/>.</returns>
        public PlayerMovementOverride Build(CombatMovement movement, CombatStateId state, bool isRoll, bool hasLockOnTarget, float lockOnYaw)
        {
            var limits = new PlayerMovementOverride();
            if (hasLockOnTarget)
            {
                limits.HasFacing = true;
                limits.FacingYaw = lockOnYaw;
                limits.FacingTurnRate = LockOnTurnRate;
                limits.Strafe = true;
            }

            switch (movement.Mode)
            {
                case CombatMovementMode.Slowed:
                    limits.SpeedLimit = movement.SpeedLimit;
                    limits.BlockJump = true;
                    limits.BlockSprint = true;
                    break;
                case CombatMovementMode.Locked:
                    limits.LockLocomotion = true;
                    limits.BlockJump = true;
                    limits.BlockSprint = true;
                    if (state == CombatStateId.Attacking || state == CombatStateId.Finisher)
                    {
                        FaceAttackDirection(ref limits);
                    }

                    break;
                case CombatMovementMode.Forced:
                    limits.HasForcedVelocity = true;
                    limits.BlockJump = true;
                    limits.BlockSprint = true;
                    if (state == CombatStateId.Dodging)
                    {
                        limits.ForcedVelocityX = DodgeDirectionX * movement.ForcedSpeed;
                        limits.ForcedVelocityZ = DodgeDirectionZ * movement.ForcedSpeed;
                        if (!hasLockOnTarget && isRoll)
                        {
                            // Without lock-on the roll turns the character into the roll direction.
                            limits.HasFacing = true;
                            limits.FacingYaw = CombatMath.YawOf(DodgeDirectionX, DodgeDirectionZ);
                            limits.FacingTurnRate = AttackTurnRate;
                        }
                    }
                    else
                    {
                        // Attack lunge along the attack direction.
                        double radians = AttackYaw * (Math.PI / 180.0);
                        limits.ForcedVelocityX = (float)Math.Sin(radians) * movement.ForcedSpeed;
                        limits.ForcedVelocityZ = (float)Math.Cos(radians) * movement.ForcedSpeed;
                        FaceAttackDirection(ref limits);
                    }

                    break;
            }

            if (_knockbackRemaining > 0f)
            {
                limits.HasForcedVelocity = true;
                limits.ForcedVelocityX = _knockbackX;
                limits.ForcedVelocityZ = _knockbackZ;
                limits.BlockJump = true;
                limits.BlockSprint = true;
            }

            return limits;
        }

        private void FaceAttackDirection(ref PlayerMovementOverride limits)
        {
            limits.HasFacing = true;
            limits.Strafe = false;
            limits.FacingYaw = AttackYaw;
            limits.FacingTurnRate = AttackTurnRate;
        }
    }
}
