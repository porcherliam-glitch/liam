using System;
using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Behaviour of <see cref="PlayerMovementModel"/> against the tuning table of GDD 03 3.1: acceleration, speed tiers,
    /// jump height, coyote time, jump buffer, air control, slopes, sprint/sneak/walk states and turning.
    /// </summary>
    [TestFixture]
    public sealed class PlayerMovementModelTests
    {
        private const float Dt = 0.005f;

        private static float HorizontalSpeed(MotionVector v)
        {
            return v.HorizontalMagnitude;
        }

        private static int Steps(float seconds, float dt = Dt)
        {
            return (int)Math.Round(seconds / dt);
        }

        [Test]
        public void Constructor_RejectsInvalidTuning()
        {
            Assert.Throws<ArgumentNullException>(() => new PlayerMovementModel(null));
            Assert.Throws<ArgumentException>(() => new PlayerMovementModel(new PlayerMovementTuning { RunSpeed = -1f }));
        }

        [Test]
        public void Ground_ReachesRunSpeedIn015Seconds()
        {
            var sim = new MovementSimulator();

            MotionVector half = sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.075f));
            Assert.That(HorizontalSpeed(half), Is.EqualTo(2.5f).Within(0.05f), "half way after 0.075 s");

            MotionVector full = sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.075f));
            Assert.That(HorizontalSpeed(full), Is.EqualTo(5f).Within(0.05f));
            Assert.That(full.Z, Is.GreaterThan(0f), "moves forward (+Z with camera yaw 0)");
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Run));
            Assert.That(sim.Model.IsGrounded, Is.True);
        }

        [Test]
        public void Ground_StopsFromRunSpeedIn012Seconds()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.5f));

            MotionVector almost = sim.Run(MovementSimulator.Move(0f, 0f), Dt, Steps(0.1f));
            Assert.That(HorizontalSpeed(almost), Is.GreaterThan(0.1f));
            MotionVector stopped = sim.Run(MovementSimulator.Move(0f, 0f), Dt, Steps(0.02f));
            Assert.That(HorizontalSpeed(stopped), Is.EqualTo(0f).Within(0.01f));
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Idle));
        }

        [TestCase(0.3f, 1.2f)]
        [TestCase(0.5f, 5.0f)]
        [TestCase(1.0f, 5.0f)]
        public void AnalogStick_SelectsWalkOrRunBySpeedTier(float deflection, float expectedSpeed)
        {
            var sim = new MovementSimulator();

            MotionVector velocity = sim.Run(MovementSimulator.Move(0f, deflection), Dt, Steps(0.5f));

            Assert.That(HorizontalSpeed(velocity), Is.EqualTo(expectedSpeed).Within(0.01f));
        }

        [Test]
        public void Movement_IsRelativeToTheCameraYaw()
        {
            var sim = new MovementSimulator();
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.CameraYaw = 90f;

            MotionVector velocity = sim.Run(input, Dt, Steps(0.5f));

            Assert.That(velocity.X, Is.EqualTo(5f).Within(0.01f));
            Assert.That(velocity.Z, Is.EqualTo(0f).Within(0.01f));
            Assert.That(sim.Model.Yaw, Is.EqualTo(90f).Within(0.01f), "turned towards the movement direction");
        }

        [Test]
        public void Turning_UsesTheRunAndSprintTurnRates()
        {
            var sim = new MovementSimulator();
            sim.Step(MovementSimulator.Move(1f, 0f), 0.05f);
            Assert.That(sim.Model.Yaw, Is.EqualTo(36f).Within(0.01f), "720 deg/s * 0.05 s");

            var sprinting = new MovementSimulator();
            PlayerMovementInput input = MovementSimulator.Move(1f, 0f);
            input.SprintHeld = true;
            sprinting.Step(input, 0.05f);
            Assert.That(sprinting.Model.Yaw, Is.EqualTo(27f).Within(0.01f), "540 deg/s * 0.05 s");
        }

        [Test]
        public void Jump_FromStanding_ReachesAbout12Metres()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            sim.ResetMaxHeight();

            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);
            Assert.That(sim.Model.JumpedThisStep, Is.True);
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, Steps(1.5f));

            Assert.That(sim.MaxHeight, Is.EqualTo(1.2f).Within(0.04f));
            Assert.That(sim.Model.IsGrounded, Is.True, "landed again");
        }

        [TestCase(30)]
        [TestCase(60)]
        [TestCase(144)]
        public void Jump_ApexIsIndependentOfTheFrameRate(int framesPerSecond)
        {
            float dt = 1f / framesPerSecond;
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 0f), dt, 4);
            sim.ResetMaxHeight();

            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, dt);
            Assert.That(sim.Model.JumpedThisStep, Is.True);
            sim.Run(MovementSimulator.Move(0f, 0f), dt, Steps(1.5f, dt));

            // Only the frame sampling around the apex may cost a few millimetres (0.5 * g * (dt / 2)^2).
            Assert.That(sim.MaxHeight, Is.EqualTo(1.2f).Within(0.01f), framesPerSecond + " fps");
            Assert.That(sim.Model.IsGrounded, Is.True, "landed again");
        }

        [TestCase(false, 5f)]
        [TestCase(true, 7f)]
        public void Jump_FlightDistanceFollowsFromHeightAndGravity(bool sprint, float speed)
        {
            // GDD 03 3.1: 1.2 m high, 1.0 g rising, 1.6 g falling -> 0.886 s of flight back to the take-off height,
            // i.e. ~4.4 m running and ~6.2 m sprinting (the guide's gap course relies on these numbers).
            const double g = 9.81;
            double flightTime = Math.Sqrt(2.0 * 1.2 / g) + Math.Sqrt(2.0 * 1.2 / (1.6 * g));
            var sim = new MovementSimulator();
            PlayerMovementInput forward = MovementSimulator.Move(0f, 1f);
            forward.SprintHeld = sprint;
            sim.Run(forward, Dt, Steps(0.5f));
            float startZ = sim.Z;

            PlayerMovementInput jump = forward;
            jump.JumpPressed = true;
            sim.Step(jump, Dt);
            int steps = 1;
            while (!sim.TouchesGround && steps < Steps(2f))
            {
                sim.Step(forward, Dt);
                steps++;
            }

            Assert.That(sim.TouchesGround, Is.True, "landed within 2 s");
            Assert.That(steps * Dt, Is.EqualTo(flightTime).Within(Dt + 1e-4), "flight time");
            Assert.That(sim.Z - startZ, Is.EqualTo(speed * flightTime).Within(0.05f), "flight distance");
        }

        [Test]
        public void Jump_CannotBeRepeatedInTheAir()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, Steps(0.05f));

            sim.Step(jump, Dt);

            Assert.That(sim.Model.JumpedThisStep, Is.False);
        }

        [Test]
        public void CoyoteTime_AllowsAJumpShortlyAfterLeavingTheGround()
        {
            const float dt = 0.02f;
            var withinWindow = LeaveLedge(dt);
            withinWindow.Run(MovementSimulator.Move(0f, 1f), dt, 4); // 0.08 s in the air (+ the jump step = 0.10 s)
            withinWindow.Step(JumpForward(), dt);
            Assert.That(withinWindow.Model.JumpedThisStep, Is.True, "0.10 s <= 0.12 s coyote time");

            var tooLate = LeaveLedge(dt);
            tooLate.Run(MovementSimulator.Move(0f, 1f), dt, 6); // 0.12 s in the air (+ the jump step = 0.14 s)
            tooLate.Step(JumpForward(), dt);
            Assert.That(tooLate.Model.JumpedThisStep, Is.False, "0.14 s > 0.12 s coyote time");
        }

        [Test]
        public void JumpBuffer_JumpsOnLandingIfPressedShortlyBefore()
        {
            const float dt = 0.02f;
            Assert.That(PressThenLand(dt, 5), Is.True, "pressed 0.10 s before landing (buffer 0.15 s)");
            Assert.That(PressThenLand(dt, 10), Is.False, "pressed 0.20 s before landing");
        }

        [Test]
        public void Gravity_FallsFasterThanItRisesAndCapsTheFallSpeed()
        {
            var sim = new MovementSimulator { HasGround = false };
            sim.Model.Reset(0f);

            // The returned Y is the mean speed of the step (exact displacement): 1.6 g from rest gives -0.5 * 1.6 g * t in the
            // first 0.1 s and -1.5 * 1.6 g * t in the second one.
            MotionVector first = sim.Step(MovementSimulator.Move(0f, 0f), 0.1f);
            Assert.That(first.Y, Is.EqualTo(-0.5f * 9.81f * 1.6f * 0.1f).Within(0.001f), "1.6 g while falling, first step");
            Assert.That(sim.Y, Is.EqualTo(-0.5f * 9.81f * 1.6f * 0.1f * 0.1f).Within(1e-4f), "fallen 0.5 * 1.6 g * t^2");
            MotionVector second = sim.Step(MovementSimulator.Move(0f, 0f), 0.1f);
            Assert.That(second.Y, Is.EqualTo(-1.5f * 9.81f * 1.6f * 0.1f).Within(0.001f), "1.6 g while falling, second step");

            MotionVector late = sim.Run(MovementSimulator.Move(0f, 0f), 0.1f, 100);
            Assert.That(late.Y, Is.EqualTo(-40f).Within(0.001f), "max fall speed 40 m/s");
        }

        [Test]
        public void CeilingHit_StopsTheUpwardMovement()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);

            sim.Model.NotifyCeilingHit();
            MotionVector next = sim.Step(MovementSimulator.Move(0f, 0f), Dt);

            Assert.That(next.Y, Is.LessThan(0f));
        }

        [Test]
        public void AirControl_CorrectsDirectionButNeverReverses()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.5f));
            PlayerMovementInput jump = MovementSimulator.Move(0f, 1f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);

            // Holding "back" for 0.6 s in the air: the forward speed shrinks but never turns negative.
            for (int i = 0; i < Steps(0.6f); i++)
            {
                MotionVector velocity = sim.Step(MovementSimulator.Move(0f, -1f), Dt);
                Assert.That(velocity.Z, Is.GreaterThanOrEqualTo(-1e-4f), "step " + i);
                if (sim.Model.IsGrounded)
                {
                    break;
                }
            }

            var sideways = new MovementSimulator();
            sideways.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.5f));
            sideways.Step(jump, Dt);
            MotionVector corrected = sideways.Run(MovementSimulator.Move(1f, 0f), Dt, Steps(0.1f));

            // The velocity turns from (0, 5) towards (5, 0) with 40 % of the ground acceleration: 13.3 m/s² * 0.1 s = 1.33 m/s
            // along the diagonal, i.e. 0.94 m/s sideways.
            float turned = 5f / 0.15f * 0.4f * 0.1f;
            Assert.That(corrected.X, Is.EqualTo(turned * 0.70710678f).Within(0.02f));
            Assert.That(corrected.Z, Is.EqualTo(5f - turned * 0.70710678f).Within(0.02f));
        }

        [Test]
        public void AirControl_DoesNotSlowDownASprintJump()
        {
            var sim = new MovementSimulator();
            PlayerMovementInput sprint = MovementSimulator.Move(0f, 1f);
            sprint.SprintHeld = true;
            sim.Run(sprint, Dt, Steps(0.5f));
            sprint.JumpPressed = true;
            sim.Step(sprint, Dt);

            // Sprint released in the air, still holding forward.
            MotionVector velocity = sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.3f));

            Assert.That(velocity.Z, Is.EqualTo(7f).Within(0.01f));
        }

        [Test]
        public void SteepSlope_Above50Degrees_SlidesDownAndBlocksJumping()
        {
            var sim = new MovementSimulator { GroundNormal = SlopeNormal(60f) };
            PlayerMovementInput uphill = MovementSimulator.Move(0f, 1f);
            uphill.JumpPressed = true;

            MotionVector velocity = sim.Step(uphill, Dt);
            Assert.That(sim.Model.IsSliding, Is.True);
            Assert.That(sim.Model.IsGrounded, Is.False);
            Assert.That(sim.Model.JumpedThisStep, Is.False, "no jumping while sliding");

            velocity = sim.Run(uphill, Dt, Steps(0.5f));
            Assert.That(velocity.Z, Is.LessThan(-1f), "slides downhill (-Z) although the player pushes uphill");
            Assert.That(velocity.Y, Is.LessThan(0f));
        }

        [Test]
        public void WalkableSlope_Below45Degrees_DoesNotSlide()
        {
            var sim = new MovementSimulator { GroundNormal = SlopeNormal(40f) };

            MotionVector velocity = sim.Run(MovementSimulator.Move(0f, 0f), Dt, Steps(0.5f));

            Assert.That(sim.Model.IsSliding, Is.False);
            Assert.That(sim.Model.IsGrounded, Is.True);
            Assert.That(HorizontalSpeed(velocity), Is.EqualTo(0f).Within(1e-4f));
        }

        [Test]
        public void WalkableSlope_UphillMovementFollowsThePlane()
        {
            var sim = new MovementSimulator { GroundNormal = SlopeNormal(30f) };

            MotionVector velocity = sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(0.5f));

            // Up a 30° slope at 5 m/s horizontal: tan(30°) * 5 = 2.89 m/s up, minus the ground stick speed (2 m/s).
            Assert.That(velocity.Y, Is.EqualTo(5f * (float)Math.Tan(30.0 * Math.PI / 180.0) - 2f).Within(0.05f));
        }

        [Test]
        public void GamepadL3_ContextRule_SprintsAbove50PercentAndSneaksBelow()
        {
            var sim = new MovementSimulator();
            sim.Step(L3(0f, 1f), Dt);
            Assert.That(sim.Model.IsSprinting, Is.True);
            Assert.That(sim.Model.IsSneaking, Is.False);
            MotionVector velocity = sim.Run(Toggle(0f, 1f), Dt, Steps(0.5f));
            Assert.That(HorizontalSpeed(velocity), Is.EqualTo(7f).Within(0.01f));

            sim.Step(Toggle(0f, 0.3f), Dt);
            Assert.That(sim.Model.IsSprinting, Is.False, "toggled sprint ends below 50 %");

            sim.Step(L3(0f, 0.2f), Dt);
            Assert.That(sim.Model.IsSneaking, Is.True, "L3 below 50 % toggles sneaking");
            velocity = sim.Run(Toggle(0f, 1f), Dt, Steps(0.5f));
            Assert.That(HorizontalSpeed(velocity), Is.EqualTo(1.8f).Within(0.01f));
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Sneak));

            sim.Step(L3(0f, 1f), Dt);
            Assert.That(sim.Model.IsSprinting, Is.True, "L3 at full deflection sprints");
            Assert.That(sim.Model.IsSneaking, Is.False, "and ends sneaking");
        }

        [Test]
        public void GamepadL3_InStandstill_TogglesSneaking()
        {
            var sim = new MovementSimulator();

            sim.Step(L3(0f, 0f), Dt);
            Assert.That(sim.Model.IsSneaking, Is.True);
            sim.Step(L3(0f, 0f), Dt);
            Assert.That(sim.Model.IsSneaking, Is.False);
        }

        [Test]
        public void Keyboard_SprintIsHeldAndSneakIsToggled()
        {
            var sim = new MovementSimulator();
            PlayerMovementInput sneak = MovementSimulator.Move(0f, 1f);
            sneak.SneakPressed = true;
            sim.Step(sneak, Dt);
            Assert.That(sim.Model.IsSneaking, Is.True);

            PlayerMovementInput shift = MovementSimulator.Move(0f, 1f);
            shift.SprintHeld = true;
            sim.Step(shift, Dt);
            Assert.That(sim.Model.IsSprinting, Is.True);
            Assert.That(sim.Model.IsSneaking, Is.False, "sprinting ends sneaking");

            sim.Step(MovementSimulator.Move(0f, 1f), Dt);
            Assert.That(sim.Model.IsSprinting, Is.False, "released Shift ends sprinting");
        }

        [Test]
        public void WalkToggle_CapsFullInputAtWalkingSpeed()
        {
            var sim = new MovementSimulator();
            PlayerMovementInput toggle = MovementSimulator.Move(0f, 1f);
            toggle.WalkTogglePressed = true;

            MotionVector velocity = sim.Run(toggle, Dt, Steps(0.5f));

            Assert.That(sim.Model.IsWalkMode, Is.True);
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Walk));
            Assert.That(HorizontalSpeed(velocity), Is.EqualTo(2f).Within(0.01f));

            toggle.WalkTogglePressed = true;
            sim.Step(toggle, Dt);
            Assert.That(sim.Model.IsWalkMode, Is.False);
        }

        [Test]
        public void Gravity_FallDistanceIsIndependentOfTheFrameRate()
        {
            // 1 s of free fall at 1.6 g: 0.5 * 15.7 m/s^2 * 1 s^2 = 7.85 m, at 30 fps as at 200 fps.
            foreach (float dt in new[] { 1f / 30f, Dt })
            {
                var sim = new MovementSimulator { HasGround = false };
                sim.Model.Reset(0f);
                sim.Run(MovementSimulator.Move(0f, 0f), dt, Steps(1f, dt));
                Assert.That(sim.Y, Is.EqualTo(-0.5f * 9.81f * 1.6f).Within(0.01f), "dt " + dt);
            }
        }

        [Test]
        public void Gravity_ReachesTheMaxFallSpeedWithinAStepExactly()
        {
            // 40 m/s at 1.6 g is reached after 2.548 s; a 0.5 s step from 2.5 s on accelerates 0.048 s, then holds 40 m/s.
            var sim = new MovementSimulator { HasGround = false };
            sim.Model.Reset(0f);
            sim.Run(MovementSimulator.Move(0f, 0f), 0.5f, 5);
            float before = sim.Y;
            MotionVector step = sim.Step(MovementSimulator.Move(0f, 0f), 0.5f);

            const float g = 9.81f * 1.6f;
            float v0 = -g * 2.5f;
            float reach = (40f + v0) / g;
            float expected = 0.5f * (v0 - 40f) * reach - 40f * (0.5f - reach);
            Assert.That(sim.Y - before, Is.EqualTo(expected).Within(1e-3f));
            Assert.That(step.Y, Is.EqualTo(expected / 0.5f).Within(1e-3f));
            Assert.That(sim.Run(MovementSimulator.Move(0f, 0f), 0.5f, 1).Y, Is.EqualTo(-40f).Within(1e-4f), "then constant");
        }

        [Test]
        public void Tuning_ControllerSlopeLimit_KeepsTheWalkableAngleWalkable()
        {
            PlayerMovementTuning tuning = PlayerMovementTuning.CreateDefault();

            // PhysX compares cosines: a ramp of exactly 45° must not depend on float rounding.
            Assert.That(tuning.ControllerSlopeLimit, Is.EqualTo(45.5f).Within(1e-4f));
            Assert.That(tuning.ControllerSlopeLimit, Is.GreaterThan(tuning.WalkableSlopeAngle));
            Assert.That(tuning.ControllerSlopeLimit, Is.LessThan(tuning.SlideStartAngle));
        }

        [Test]
        public void ZeroDeltaTime_ChangesNothing()
        {
            var sim = new MovementSimulator();
            MotionVector before = sim.Run(MovementSimulator.Move(0f, 1f), Dt, 10);

            MotionVector after = sim.Model.Step(MovementSimulator.Move(1f, 0f), GroundContact.Flat, 0f);

            Assert.That(after, Is.EqualTo(before));
        }

        [Test]
        public void Reset_StopsMovementAndSetsTheFacing()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 1f), Dt, 40);

            sim.Model.Reset(123f);

            Assert.That(sim.Model.Velocity, Is.EqualTo(MotionVector.Zero));
            Assert.That(sim.Model.Yaw, Is.EqualTo(123f));
            Assert.That(sim.Model.IsGrounded, Is.False);
            Assert.That(sim.Model.HorizontalSpeed, Is.EqualTo(0f));
        }

        [Test]
        public void IsAirborne_AtOnceWhenJumping_UntilTheLanding()
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            Assert.That(sim.Model.IsAirborne, Is.False, "standing");

            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, Dt);
            Assert.That(sim.Model.IsAirborne, Is.True, "a jump counts at once (save lock, architecture 9.8)");

            int steps = 0;
            while (!sim.Model.IsGrounded && steps < Steps(3f))
            {
                sim.Step(MovementSimulator.Move(0f, 0f), Dt);
                steps++;
                Assert.That(sim.Model.IsAirborne, Is.EqualTo(!sim.Model.IsGrounded), "in the air until the landing");
            }

            Assert.That(sim.Model.IsGrounded, Is.True, "landed within 3 s");
            Assert.That(sim.Model.IsAirborne, Is.False);
        }

        [Test]
        public void IsAirborne_AfterWalkingOffAnEdge_OnlyAfterTheCoyoteTime()
        {
            const float dt = 0.02f;
            MovementSimulator sim = LeaveLedge(dt);

            sim.Run(MovementSimulator.Move(0f, 1f), dt, 5);
            Assert.That(sim.Model.IsAirborne, Is.False, "0.10 s <= 0.12 s coyote time: no flicker on stairs and edges");

            sim.Run(MovementSimulator.Move(0f, 1f), dt, 2);
            Assert.That(sim.Model.IsAirborne, Is.True, "0.14 s > 0.12 s: falling");
        }

        [Test]
        public void IsAirborne_NotWhileSliding_AndAfterATeleportUntilTheNextStep()
        {
            var sliding = new MovementSimulator { GroundNormal = SlopeNormal(60f) };
            sliding.Run(MovementSimulator.Move(0f, 0f), Dt, 10);
            Assert.That(sliding.Model.IsSliding, Is.True);
            Assert.That(sliding.Model.IsAirborne, Is.False, "sliding down a steep slope is no fall");

            var teleported = new MovementSimulator();
            teleported.Run(MovementSimulator.Move(0f, 0f), Dt, 4);
            teleported.Model.Reset(90f);
            Assert.That(teleported.Model.IsAirborne, Is.True, "after a teleport the ground is unknown until the next step");
            teleported.Step(MovementSimulator.Move(0f, 0f), Dt);
            Assert.That(teleported.Model.IsAirborne, Is.False);
        }

        private static PlayerMovementInput JumpForward()
        {
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.JumpPressed = true;
            return input;
        }

        private static PlayerMovementInput Toggle(float x, float y)
        {
            PlayerMovementInput input = MovementSimulator.Move(x, y);
            input.SprintToggleMode = true;
            return input;
        }

        private static PlayerMovementInput L3(float x, float y)
        {
            // Default gamepad binding: Sprint and Sneak share L3, both fire in the same frame.
            PlayerMovementInput input = Toggle(x, y);
            input.SprintPressed = true;
            input.SneakPressed = true;
            input.SprintSneakShared = true;
            return input;
        }

        private static MovementSimulator LeaveLedge(float dt)
        {
            var sim = new MovementSimulator();
            sim.Run(MovementSimulator.Move(0f, 1f), dt, 20);
            sim.HasGround = false;
            return sim;
        }

        private static bool PressThenLand(float dt, int stepsBeforeLanding)
        {
            var sim = new MovementSimulator { HasGround = false };
            sim.Model.Reset(0f);
            sim.Y = 50f;
            sim.Run(MovementSimulator.Move(0f, 0f), dt, 10);

            PlayerMovementInput jump = MovementSimulator.Move(0f, 0f);
            jump.JumpPressed = true;
            sim.Step(jump, dt);
            Assert.That(sim.Model.JumpedThisStep, Is.False, "no jump in the air");
            sim.Run(MovementSimulator.Move(0f, 0f), dt, stepsBeforeLanding - 1);

            // Landing: ground contact in the next step.
            sim.HasGround = true;
            sim.Y = 0f;
            sim.Step(MovementSimulator.Move(0f, 0f), dt);
            return sim.Model.JumpedThisStep;
        }

        private static MotionVector SlopeNormal(float degrees)
        {
            // Slope rising towards +Z: the normal leans towards -Z.
            double radians = degrees * Math.PI / 180.0;
            return new MotionVector(0f, (float)Math.Cos(radians), -(float)Math.Sin(radians));
        }
    }
}
