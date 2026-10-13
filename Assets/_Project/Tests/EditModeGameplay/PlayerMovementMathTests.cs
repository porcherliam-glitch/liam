using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>Unit tests for <see cref="PlayerMovementMath"/>, <see cref="PlayerGaitRules"/> and <see cref="PlayerMovementTuning"/>.</summary>
    [TestFixture]
    public sealed class PlayerMovementMathTests
    {
        private const float Tolerance = 1e-4f;

        [TestCase(0f, 1f, 0f, 0f, 0f, 1f)]       // forward, camera along +Z
        [TestCase(1f, 0f, 0f, 1f, 0f, 0f)]       // right, camera along +Z
        [TestCase(0f, 1f, 90f, 1f, 0f, 0f)]      // forward, camera along +X
        [TestCase(1f, 0f, 90f, 0f, 0f, -1f)]     // right of +X is -Z
        [TestCase(0f, 1f, 180f, 0f, 0f, -1f)]    // forward, camera along -Z
        [TestCase(0f, -1f, 270f, 1f, 0f, 0f)]    // back, camera along -X
        public void CameraRelativeDirection_RotatesInputByCameraYaw(float inX, float inY, float yaw, float x, float y, float z)
        {
            MotionVector direction = PlayerMovementMath.CameraRelativeDirection(inX, inY, yaw);

            Assert.That(direction.X, Is.EqualTo(x).Within(Tolerance));
            Assert.That(direction.Y, Is.EqualTo(y).Within(Tolerance));
            Assert.That(direction.Z, Is.EqualTo(z).Within(Tolerance));
        }

        [Test]
        public void CameraRelativeDirection_KeepsPartialMagnitudeAndClampsAboveOne()
        {
            MotionVector half = PlayerMovementMath.CameraRelativeDirection(0f, 0.4f, 37f);
            MotionVector big = PlayerMovementMath.CameraRelativeDirection(3f, 4f, 0f);

            Assert.That(half.Magnitude, Is.EqualTo(0.4f).Within(Tolerance));
            Assert.That(big.Magnitude, Is.EqualTo(1f).Within(Tolerance));
            Assert.That(big.X, Is.EqualTo(0.6f).Within(Tolerance));
        }

        [Test]
        public void JumpVelocity_ReachesTheGddHeight()
        {
            // GDD 03 3.1: 1.2 m at 1 g -> v = sqrt(2 * 9.81 * 1.2) = 4.852 m/s.
            Assert.That(PlayerMovementMath.JumpVelocity(1.2f, 9.81f), Is.EqualTo(4.852f).Within(0.001f));
            Assert.That(PlayerMovementMath.JumpVelocity(0f, 9.81f), Is.EqualTo(0f));
            Assert.That(PlayerMovementMath.JumpVelocity(1f, 0f), Is.EqualTo(0f));
        }

        [TestCase(0f, 1f, 0f, 0f)]
        [TestCase(0f, 0f, 1f, 90f)]
        [TestCase(0f, 0.8660254f, -0.5f, 30f)]
        [TestCase(0f, 0.5f, -0.8660254f, 60f)]
        [TestCase(0f, 2f, 0f, 0f)] // not normalized
        public void SlopeAngle_IsTheAngleToWorldUp(float x, float y, float z, float expected)
        {
            Assert.That(PlayerMovementMath.SlopeAngle(new MotionVector(x, y, z)), Is.EqualTo(expected).Within(0.01f));
        }

        [TestCase(0f, 90f, 30f, 30f)]
        [TestCase(0f, 90f, 120f, 90f)]
        [TestCase(10f, 350f, 15f, 355f)]      // shorter way over 0
        [TestCase(350f, 10f, 5f, 355f)]
        [TestCase(0f, 180f, 720f, 180f)]
        [TestCase(-30f, 0f, 0f, 330f)]        // normalized
        public void MoveTowardsAngle_TurnsTheShorterWayAndNormalizes(float current, float target, float maxDelta, float expected)
        {
            Assert.That(PlayerMovementMath.MoveTowardsAngle(current, target, maxDelta), Is.EqualTo(expected).Within(Tolerance));
        }

        [Test]
        public void DeltaAngle_IsSignedAndShortest()
        {
            Assert.That(PlayerMovementMath.DeltaAngle(10f, 350f), Is.EqualTo(-20f).Within(Tolerance));
            Assert.That(PlayerMovementMath.DeltaAngle(350f, 10f), Is.EqualTo(20f).Within(Tolerance));
            Assert.That(PlayerMovementMath.NormalizeAngle(720f), Is.EqualTo(0f).Within(Tolerance));
            Assert.That(PlayerMovementMath.YawOf(1f, 0f), Is.EqualTo(90f).Within(Tolerance));
            Assert.That(PlayerMovementMath.YawOf(0f, -1f), Is.EqualTo(180f).Within(Tolerance));
        }

        [TestCase(0f, false, false, false, PlayerGait.Idle)]
        [TestCase(0.3f, false, false, false, PlayerGait.Walk)]
        [TestCase(0.49f, false, false, false, PlayerGait.Walk)]
        [TestCase(0.5f, false, false, false, PlayerGait.Run)]
        [TestCase(1f, false, false, false, PlayerGait.Run)]
        [TestCase(1f, false, false, true, PlayerGait.Walk)]
        [TestCase(1f, true, false, false, PlayerGait.Sprint)]
        [TestCase(1f, true, false, true, PlayerGait.Sprint)]
        [TestCase(1f, false, true, false, PlayerGait.Sneak)]
        [TestCase(0f, true, true, false, PlayerGait.Idle)]
        public void ResolveGait_FollowsTheStickTiers(float magnitude, bool sprinting, bool sneaking, bool walkMode, PlayerGait expected)
        {
            Assert.That(PlayerGaitRules.ResolveGait(magnitude, sprinting, sneaking, walkMode, 0.5f), Is.EqualTo(expected));
        }

        [TestCase(PlayerGait.Idle, 1f, 0f)]
        [TestCase(PlayerGait.Walk, 1f, 2.0f)]
        [TestCase(PlayerGait.Walk, 0.25f, 1.0f)]
        [TestCase(PlayerGait.Run, 0.5f, 5.0f)]
        [TestCase(PlayerGait.Run, 1f, 5.0f)]
        [TestCase(PlayerGait.Sprint, 1f, 7.0f)]
        [TestCase(PlayerGait.Sneak, 1f, 1.8f)]
        [TestCase(PlayerGait.Sneak, 0.25f, 0.9f)]
        public void TargetSpeed_UsesTheGddSpeeds(PlayerGait gait, float magnitude, float expected)
        {
            Assert.That(PlayerGaitRules.TargetSpeed(gait, magnitude, PlayerMovementTuning.CreateDefault()), Is.EqualTo(expected).Within(Tolerance));
        }

        [Test]
        public void Tuning_DefaultsAreTheGddValues()
        {
            PlayerMovementTuning tuning = PlayerMovementTuning.CreateDefault();

            Assert.That(tuning.WalkSpeed, Is.EqualTo(2.0f));
            Assert.That(tuning.RunSpeed, Is.EqualTo(5.0f));
            Assert.That(tuning.SprintSpeed, Is.EqualTo(7.0f));
            Assert.That(tuning.SneakSpeed, Is.EqualTo(1.8f));
            Assert.That(tuning.RunInputThreshold, Is.EqualTo(0.5f));
            Assert.That(tuning.AccelerationTime, Is.EqualTo(0.15f));
            Assert.That(tuning.DecelerationTime, Is.EqualTo(0.12f));
            Assert.That(tuning.TurnRate, Is.EqualTo(720f));
            Assert.That(tuning.SprintTurnRate, Is.EqualTo(540f));
            Assert.That(tuning.JumpHeight, Is.EqualTo(1.2f));
            Assert.That(tuning.RisingGravityScale, Is.EqualTo(1.0f));
            Assert.That(tuning.FallingGravityScale, Is.EqualTo(1.6f));
            Assert.That(tuning.MaxFallSpeed, Is.EqualTo(40f));
            Assert.That(tuning.AirControl, Is.EqualTo(0.4f));
            Assert.That(tuning.CoyoteTime, Is.EqualTo(0.12f));
            Assert.That(tuning.JumpBufferTime, Is.EqualTo(0.15f));
            Assert.That(tuning.WalkableSlopeAngle, Is.EqualTo(45f));
            Assert.That(tuning.SlideStartAngle, Is.EqualTo(50f));
            Assert.That(tuning.Validate(), Is.Empty);
            Assert.That(tuning.GroundAcceleration, Is.EqualTo(5f / 0.15f).Within(0.01f));
            Assert.That(tuning.GroundDeceleration, Is.EqualTo(5f / 0.12f).Within(0.01f));
        }

        [Test]
        public void Tuning_Validate_ReportsInvalidValues()
        {
            Assert.That(new PlayerMovementTuning { RunSpeed = 0f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { RunInputThreshold = 0f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { AccelerationTime = 0f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { AirControl = 1.5f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { CoyoteTime = -0.1f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { SlideStartAngle = 40f }.Validate(), Is.Not.Empty);
            Assert.That(new PlayerMovementTuning { Gravity = 0f }.Validate(), Is.Not.Empty);
        }
    }
}
