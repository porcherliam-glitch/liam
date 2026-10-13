using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Combat limits of the movement model (<see cref="PlayerMovementOverride"/>): lock-on strafing (GDD 03 2.3: forward
    /// 5.0, sideways 4.0, backwards 3.5 m/s, the character keeps facing the target), sprinting ends the strafe, locked
    /// locomotion in attacks, forced velocity for dodge rolls and lunges, speed limit while blocking, no jump.
    /// </summary>
    [TestFixture]
    public sealed class PlayerMovementOverrideTests
    {
        private const float Dt = 0.01f;

        private static PlayerMovementOverride LockOn(float facingYaw)
        {
            return new PlayerMovementOverride { HasFacing = true, FacingYaw = facingYaw, Strafe = true };
        }

        [TestCase(0f, 1f, 5.0f)]
        [TestCase(1f, 0f, 4.0f)]
        [TestCase(-1f, 0f, 4.0f)]
        [TestCase(0f, -1f, 3.5f)]
        public void LockOn_StrafeSpeedsByDirection(float moveX, float moveY, float expected)
        {
            var sim = new MovementSimulator { Limits = LockOn(0f) };

            MotionVector velocity = sim.Run(MovementSimulator.Move(moveX, moveY), Dt, 50);

            Assert.That(velocity.HorizontalMagnitude, Is.EqualTo(expected).Within(0.02f));
            Assert.That(sim.Model.Yaw, Is.EqualTo(0f).Within(0.01f), "Keeps facing the target while strafing.");
        }

        [Test]
        public void LockOn_DiagonalBlendsForwardAndSide()
        {
            var sim = new MovementSimulator { Limits = LockOn(0f) };

            MotionVector velocity = sim.Run(MovementSimulator.Move(0.7071f, 0.7071f), Dt, 50);

            Assert.That(velocity.HorizontalMagnitude, Is.EqualTo(4.707f).Within(0.02f));
        }

        [Test]
        public void LockOn_TurnsTowardsTheTarget()
        {
            var sim = new MovementSimulator { Limits = LockOn(90f) };

            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 5);
            Assert.That(sim.Model.Yaw, Is.EqualTo(36f).Within(0.1f), "Default turn rate 720 degrees per second.");

            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 20);
            Assert.That(sim.Model.Yaw, Is.EqualTo(90f).Within(0.01f));
        }

        [Test]
        public void LockOn_SprintEndsStrafingAndTurnsToMovement()
        {
            var sim = new MovementSimulator { Limits = LockOn(0f) };
            PlayerMovementInput sprintRight = MovementSimulator.Move(1f, 0f);
            sprintRight.SprintHeld = true;

            MotionVector velocity = sim.Run(sprintRight, Dt, 60);

            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Sprint));
            Assert.That(velocity.HorizontalMagnitude, Is.EqualTo(7.0f).Within(0.05f));
            Assert.That(sim.Model.Yaw, Is.EqualTo(90f).Within(0.5f));
        }

        [Test]
        public void LockLocomotion_StopsInputMovementAndJump()
        {
            var sim = new MovementSimulator { Limits = new PlayerMovementOverride { LockLocomotion = true } };
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.JumpPressed = true;

            MotionVector velocity = sim.Run(input, Dt, 30);

            Assert.That(velocity.HorizontalMagnitude, Is.EqualTo(0f).Within(1e-3f));
            Assert.That(sim.MaxHeight, Is.EqualTo(0f).Within(1e-3f));
            Assert.That(sim.Model.Yaw, Is.EqualTo(0f));
        }

        [Test]
        public void ForcedVelocity_MovesIndependentOfInput()
        {
            // Dodge roll to the right: 4.2 m in 0.55 s.
            var sim = new MovementSimulator
            {
                Limits = new PlayerMovementOverride { HasForcedVelocity = true, ForcedVelocityX = 4.2f / 0.55f }
            };

            sim.Run(MovementSimulator.Move(0f, -1f), Dt, 55);

            Assert.That(sim.X, Is.EqualTo(4.2f).Within(0.02f));
            Assert.That(sim.Z, Is.EqualTo(0f).Within(1e-3f));
        }

        [Test]
        public void SpeedLimit_CapsTheRunSpeed()
        {
            var sim = new MovementSimulator { Limits = new PlayerMovementOverride { SpeedLimit = 2.5f } };

            MotionVector velocity = sim.Run(MovementSimulator.Move(0f, 1f), Dt, 50);

            Assert.That(velocity.HorizontalMagnitude, Is.EqualTo(2.5f).Within(0.02f));
        }

        [Test]
        public void BlockJumpAndSprint_WhileBlocking()
        {
            var sim = new MovementSimulator { Limits = new PlayerMovementOverride { BlockJump = true, BlockSprint = true, SpeedLimit = 2.5f } };
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.JumpPressed = true;
            input.SprintHeld = true;

            sim.Run(input, Dt, 30);

            Assert.That(sim.MaxHeight, Is.EqualTo(0f).Within(1e-3f));
            Assert.That(sim.Model.IsSprinting, Is.False);
        }

        [Test]
        public void DefaultLimits_BehaveLikeTheOldStep()
        {
            var plain = new MovementSimulator();
            var limited = new MovementSimulator { Limits = default };

            MotionVector a = plain.Run(MovementSimulator.Move(0.3f, 1f), Dt, 40);
            MotionVector b = limited.Run(MovementSimulator.Move(0.3f, 1f), Dt, 40);

            Assert.That(b.X, Is.EqualTo(a.X));
            Assert.That(b.Z, Is.EqualTo(a.Z));
            Assert.That(limited.Model.Yaw, Is.EqualTo(plain.Model.Yaw));
        }

        [Test]
        public void StrafeSpeedCap_Math()
        {
            Assert.That(PlayerMovementMath.StrafeSpeedCap(0f, 1f, 0f, 5f, 4f, 3.5f), Is.EqualTo(5f).Within(1e-4f));
            Assert.That(PlayerMovementMath.StrafeSpeedCap(1f, 0f, 0f, 5f, 4f, 3.5f), Is.EqualTo(4f).Within(1e-4f));
            Assert.That(PlayerMovementMath.StrafeSpeedCap(0f, -1f, 0f, 5f, 4f, 3.5f), Is.EqualTo(3.5f).Within(1e-4f));
            Assert.That(PlayerMovementMath.StrafeSpeedCap(1f, 0f, 90f, 5f, 4f, 3.5f), Is.EqualTo(5f).Within(1e-4f), "Facing +X.");
        }
    }
}
