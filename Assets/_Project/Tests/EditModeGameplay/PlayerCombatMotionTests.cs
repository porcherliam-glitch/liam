using Aetherfall.Combat;
using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Movement limits from the combat state (<see cref="PlayerCombatMotion"/>): lock-on strafing, slowed block, locked
    /// attacks facing the attack direction, dodge and lunge velocities, knockback.
    /// </summary>
    [TestFixture]
    public sealed class PlayerCombatMotionTests
    {
        [Test]
        public void Free_WithoutLockOn_ChangesNothing()
        {
            var motion = new PlayerCombatMotion();

            PlayerMovementOverride limits = motion.Build(CombatMovement.Free, CombatStateId.Idle, false, false, 0f);

            Assert.That(limits.HasFacing, Is.False);
            Assert.That(limits.LockLocomotion, Is.False);
            Assert.That(limits.HasForcedVelocity, Is.False);
            Assert.That(limits.SpeedLimit, Is.EqualTo(0f));
        }

        [Test]
        public void LockOn_StrafesTowardsTheTarget()
        {
            var motion = new PlayerCombatMotion();

            PlayerMovementOverride limits = motion.Build(CombatMovement.Free, CombatStateId.Idle, false, true, 135f);

            Assert.That(limits.HasFacing, Is.True);
            Assert.That(limits.Strafe, Is.True);
            Assert.That(limits.FacingYaw, Is.EqualTo(135f));
            Assert.That(limits.FacingTurnRate, Is.EqualTo(PlayerCombatMotion.LockOnTurnRate));
        }

        [Test]
        public void Blocking_SlowsAndForbidsJumpAndSprint()
        {
            var motion = new PlayerCombatMotion();

            PlayerMovementOverride limits = motion.Build(new CombatMovement(CombatMovementMode.Slowed, 2.5f), CombatStateId.Blocking, false, false, 0f);

            Assert.That(limits.SpeedLimit, Is.EqualTo(2.5f));
            Assert.That(limits.BlockJump, Is.True);
            Assert.That(limits.BlockSprint, Is.True);
        }

        [Test]
        public void Attacking_LocksAndFacesTheAttackDirectionEvenInLockOn()
        {
            var motion = new PlayerCombatMotion { AttackYaw = 30f };

            PlayerMovementOverride limits = motion.Build(CombatMovement.Locked, CombatStateId.Attacking, false, true, 90f);

            Assert.That(limits.LockLocomotion, Is.True);
            Assert.That(limits.Strafe, Is.False);
            Assert.That(limits.FacingYaw, Is.EqualTo(30f));
            Assert.That(limits.FacingTurnRate, Is.EqualTo(PlayerCombatMotion.AttackTurnRate));
        }

        [Test]
        public void Roll_MovesInRollDirectionAndTurnsWithoutLockOn()
        {
            var motion = new PlayerCombatMotion();
            motion.SetDodgeDirection(3f, 0f, 0f);

            PlayerMovementOverride limits = motion.Build(new CombatMovement(CombatMovementMode.Forced, 0f, 7.6f), CombatStateId.Dodging, true, false, 0f);

            Assert.That(limits.HasForcedVelocity, Is.True);
            Assert.That(limits.ForcedVelocityX, Is.EqualTo(7.6f).Within(1e-4f));
            Assert.That(limits.ForcedVelocityZ, Is.EqualTo(0f).Within(1e-4f));
            Assert.That(limits.FacingYaw, Is.EqualTo(90f).Within(1e-3f));
        }

        [Test]
        public void BackStep_WithoutDirection_GoesStraightBack()
        {
            var motion = new PlayerCombatMotion();

            motion.SetDodgeDirection(0f, 0f, 90f);

            Assert.That(motion.DodgeDirectionX, Is.EqualTo(-1f).Within(1e-5f));
            Assert.That(motion.DodgeDirectionZ, Is.EqualTo(0f).Within(1e-5f));
        }

        [Test]
        public void Lunge_MovesAlongTheAttackDirection()
        {
            var motion = new PlayerCombatMotion { AttackYaw = 0f };

            PlayerMovementOverride limits = motion.Build(new CombatMovement(CombatMovementMode.Forced, 0f, 5f), CombatStateId.Attacking, false, false, 0f);

            Assert.That(limits.ForcedVelocityX, Is.EqualTo(0f).Within(1e-4f));
            Assert.That(limits.ForcedVelocityZ, Is.EqualTo(5f).Within(1e-4f));
            Assert.That(limits.FacingYaw, Is.EqualTo(0f));
        }

        [Test]
        public void Knockback_PushesAwayForItsDuration()
        {
            var motion = new PlayerCombatMotion(0.15f);

            Assert.That(motion.StartKnockback(0f, 0f, 0f, 2f, 0.3f), Is.True);
            PlayerMovementOverride limits = motion.Build(CombatMovement.Free, CombatStateId.Staggered, false, false, 0f);
            Assert.That(limits.HasForcedVelocity, Is.True);
            Assert.That(limits.ForcedVelocityZ, Is.EqualTo(2f).Within(1e-4f), "0.3 m in 0.15 s.");

            motion.Tick(0.16f);
            Assert.That(motion.IsKnockedBack, Is.False);
            Assert.That(motion.Build(CombatMovement.Free, CombatStateId.Idle, false, false, 0f).HasForcedVelocity, Is.False);
        }

        [Test]
        public void Knockback_OnTheSameSpot_IsIgnored()
        {
            var motion = new PlayerCombatMotion();

            Assert.That(motion.StartKnockback(1f, 1f, 1f, 1f, 0.3f), Is.False);
            Assert.That(motion.StartKnockback(0f, 0f, 0f, 1f, 0f), Is.False);
        }

        [Test]
        public void Clear_EndsKnockback()
        {
            var motion = new PlayerCombatMotion();
            motion.StartKnockback(0f, 0f, 1f, 0f, 0.3f);

            motion.Clear();

            Assert.That(motion.IsKnockedBack, Is.False);
        }
    }
}
