using System;
using Aetherfall.Player;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Stamina costs of <see cref="PlayerMovementModel"/> (GDD 03 3.1 and 4.3): sprinting costs 12 per second and needs at
    /// least 10 to start, a jump costs 10 and needs more than 0, at 0 the sprint ends and the pool is exhausted for 1.2 s.
    /// Regeneration (25 per second after 0.8 s) comes from the pool, which the simulator ticks after every step.
    /// </summary>
    [TestFixture]
    public sealed class PlayerStaminaTests
    {
        private const float Dt = 0.005f;

        private static int Steps(float seconds)
        {
            return (int)Math.Round(seconds / Dt);
        }

        private static ResourcePool CreatePool(float current = 100f)
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.SetCurrent(current);
            return pool;
        }

        private static PlayerMovementInput SprintForward()
        {
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.SprintHeld = true;
            return input;
        }

        private static float RunUntil(MovementSimulator sim, PlayerMovementInput input, Func<bool> condition, float maxSeconds)
        {
            int maxSteps = Steps(maxSeconds);
            for (int i = 0; i < maxSteps; i++)
            {
                sim.Step(input, Dt);
                input.JumpPressed = false;
                input.SprintPressed = false;
                if (condition())
                {
                    return (i + 1) * Dt;
                }
            }

            Assert.Fail("Condition not reached within " + maxSeconds + " s.");
            return maxSeconds;
        }

        [Test]
        public void Tuning_DefaultsMatchTheGdd()
        {
            PlayerMovementTuning tuning = PlayerMovementTuning.CreateDefault();

            Assert.That(tuning.SprintStaminaPerSecond, Is.EqualTo(12f));
            Assert.That(tuning.SprintStartMinimumStamina, Is.EqualTo(10f));
            Assert.That(tuning.JumpStaminaCost, Is.EqualTo(10f));
            Assert.Throws<ArgumentException>(() => new PlayerMovementModel(new PlayerMovementTuning { SprintStaminaPerSecond = -1f }));
            Assert.Throws<ArgumentException>(() => new PlayerMovementModel(new PlayerMovementTuning { JumpStaminaCost = -1f }));
        }

        [Test]
        public void Sprint_Costs12StaminaPerSecond()
        {
            var sim = new MovementSimulator(stamina: CreatePool());

            sim.Run(SprintForward(), Dt, Steps(2f));

            Assert.That(sim.Model.IsSprinting, Is.True);
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Sprint));
            Assert.That(sim.Stamina.Current, Is.EqualTo(76f).Within(0.05f), "100 - 2 s x 12");
        }

        [Test]
        public void Running_CostsNoStamina()
        {
            var sim = new MovementSimulator(stamina: CreatePool(50f));

            sim.Run(MovementSimulator.Move(0f, 1f), Dt, Steps(1f));

            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Run));
            Assert.That(sim.Stamina.Current, Is.EqualTo(75f).Within(0.05f), "only regeneration (25 per second)");
        }

        [Test]
        public void Sprint_DoesNotStartBelow10_AndStartsOnceRegenerated()
        {
            var sim = new MovementSimulator(stamina: CreatePool(5f));
            PlayerMovementInput input = SprintForward();

            sim.Step(input, Dt);
            Assert.That(sim.Model.CanStartSprint, Is.False);
            Assert.That(sim.Model.IsSprinting, Is.False, "5 stamina is below the minimum of 10");
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Run));

            float seconds = RunUntil(sim, input, () => sim.Model.IsSprinting, 1f);

            Assert.That(seconds, Is.EqualTo(0.2f).Within(0.02f), "5 more at 25 per second while Shift stays held");
            Assert.That(sim.Stamina.Current, Is.GreaterThanOrEqualTo(9.9f));
        }

        [Test]
        public void Sprint_EndsAtZero_AndTheExhaustionBlocksARestartUntil10AreBack()
        {
            var sim = new MovementSimulator(stamina: CreatePool(10.5f));
            PlayerMovementInput input = SprintForward();

            float untilEmpty = RunUntil(sim, input, () => sim.Stamina.IsEmpty, 2f);
            Assert.That(untilEmpty, Is.EqualTo(10.5f / 12f).Within(0.02f));
            Assert.That(sim.Model.IsSprinting, Is.False, "the sprint ends at 0");
            Assert.That(sim.Stamina.IsExhausted, Is.True);

            sim.Run(input, Dt, Steps(1.1f));
            Assert.That(sim.Model.IsSprinting, Is.False, "still exhausted after 1.1 s although Shift is held");
            Assert.That(sim.Model.Gait, Is.EqualTo(PlayerGait.Run));

            sim.Run(input, Dt, Steps(0.2f));
            Assert.That(sim.Stamina.IsExhausted, Is.False);
            Assert.That(sim.Model.IsSprinting, Is.True, "1.2 s exhausted, 0.8 s delay + 0.4 s x 25 = 10 again");
        }

        [Test]
        public void ToggledSprint_EndsAtZero_AndNeedsANewPress()
        {
            var sim = new MovementSimulator(stamina: CreatePool(12f));
            PlayerMovementInput input = MovementSimulator.Move(0f, 1f);
            input.SprintToggleMode = true;
            input.SprintPressed = true;

            RunUntil(sim, input, () => sim.Stamina.IsEmpty, 2f);
            Assert.That(sim.Model.IsSprinting, Is.False);

            sim.Run(input, Dt, Steps(6f));
            Assert.That(sim.Stamina.IsFull, Is.True);
            Assert.That(sim.Model.IsSprinting, Is.False, "a toggled sprint does not restart by itself");

            input.SprintPressed = true;
            sim.Step(input, Dt);
            Assert.That(sim.Model.IsSprinting, Is.True);
        }

        [Test]
        public void Jump_Costs10Stamina()
        {
            var sim = new MovementSimulator(stamina: CreatePool());
            var input = new PlayerMovementInput { JumpPressed = true };

            sim.Step(input, Dt);

            Assert.That(sim.Model.JumpedThisStep, Is.True);
            Assert.That(sim.Stamina.Current, Is.EqualTo(90f).Within(1e-4f));
        }

        [Test]
        public void Jump_WithLessThan10_SpendsTheRestAndNeverGoesBelowZero()
        {
            var sim = new MovementSimulator(stamina: CreatePool(5f));
            var input = new PlayerMovementInput { JumpPressed = true };

            sim.Step(input, Dt);

            Assert.That(sim.Model.JumpedThisStep, Is.True, "a jump is allowed while stamina is above 0");
            Assert.That(sim.Stamina.Current, Is.EqualTo(0f));
            Assert.That(sim.Stamina.IsExhausted, Is.True);
        }

        [Test]
        public void Jump_IsRefusedAtZero()
        {
            ResourcePool pool = CreatePool();
            pool.Spend(100f);
            var sim = new MovementSimulator(stamina: pool);
            var input = new PlayerMovementInput { JumpPressed = true };

            sim.Run(input, Dt, Steps(0.3f));

            Assert.That(sim.MaxHeight, Is.EqualTo(0f).Within(1e-4f), "no jump, not even from the jump buffer");
            Assert.That(sim.Stamina.Current, Is.EqualTo(0f));
        }

        [Test]
        public void WithoutAPool_StaminaIsUnlimited()
        {
            var sim = new MovementSimulator();

            sim.Run(SprintForward(), Dt, Steps(30f));

            Assert.That(sim.Model.Stamina, Is.Null);
            Assert.That(sim.Model.CanStartSprint, Is.True);
            Assert.That(sim.Model.IsSprinting, Is.True);
        }

        [Test]
        public void StatBoundPool_UsesMaxStaminaFromTheStats()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Constitution, 20f);
            stats.SetBase(StatId.Level, 1f);
            var pool = new ResourcePool(stats, StatId.MaxStamina, ResourcePoolSettings.Stamina, StatId.StaminaRegen);
            var sim = new MovementSimulator(stamina: pool);

            sim.Run(SprintForward(), Dt, Steps(1f));

            Assert.That(pool.Max, Is.EqualTo(120f), "100 + 2 x E(20)");
            Assert.That(pool.Current, Is.EqualTo(108f).Within(0.05f));
        }
    }
}
