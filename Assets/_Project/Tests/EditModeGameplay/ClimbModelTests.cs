using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Climbing after GDD 03 3.3 (<see cref="ClimbModel"/>): speeds per surface, stamina 6/s moving, 2/s hanging, none on
    /// ladders and rest points, climb jump 1.8 m for 20 stamina, fast climbing ×1.5 speed and ×2 stamina, 1 s shaking at
    /// 0 stamina before the fall, letting go.
    /// </summary>
    [TestFixture]
    public sealed class ClimbModelTests
    {
        private const float Dt = 0.01f;

        private static ClimbModel.StepResult Run(ClimbModel model, ClimbSurfaceKind kind, float seconds, float moveX, float moveY, out float right,
            out float up, out float stamina, bool fast = false, bool rest = false, float staminaStart = 100f)
        {
            right = 0f;
            up = 0f;
            stamina = 0f;
            var last = new ClimbModel.StepResult();
            int steps = (int)System.Math.Round(seconds / Dt);
            for (int i = 0; i < steps; i++)
            {
                last = model.Step(kind, rest, moveX, moveY, fast, false, false, staminaStart - stamina, Dt);
                right += last.Right;
                up += last.Up;
                stamina += last.StaminaCost;
            }

            return last;
        }

        [TestCase(ClimbSurfaceKind.Rock, 1.2f)]
        [TestCase(ClimbSurfaceKind.Vines, 1.0f)]
        [TestCase(ClimbSurfaceKind.Ladder, 1.5f)]
        public void ClimbsUpAtTheSpeedOfTheSurface(ClimbSurfaceKind kind, float speed)
        {
            var model = new ClimbModel();
            model.Begin();

            Run(model, kind, 1f, 0f, 1f, out _, out float up, out _);

            Assert.That(up, Is.EqualTo(speed).Within(1e-3f));
        }

        [Test]
        public void RockSidewaysIsFasterThanUp_LaddersHaveNoSideways()
        {
            var model = new ClimbModel();
            model.Begin();
            Run(model, ClimbSurfaceKind.Rock, 1f, 1f, 0f, out float right, out _, out _);
            Assert.That(right, Is.EqualTo(1.4f).Within(1e-3f));

            Run(model, ClimbSurfaceKind.Ladder, 1f, 1f, 0f, out right, out _, out _);
            Assert.That(right, Is.EqualTo(0f));
        }

        [Test]
        public void StaminaIs6PerSecondMoving_2Hanging_NoneOnLaddersAndRestPoints()
        {
            var model = new ClimbModel();
            model.Begin();

            Run(model, ClimbSurfaceKind.Rock, 1f, 0f, 1f, out _, out _, out float moving);
            Run(model, ClimbSurfaceKind.Rock, 1f, 0f, 0f, out _, out _, out float hanging);
            Run(model, ClimbSurfaceKind.Ladder, 1f, 0f, 1f, out _, out _, out float ladder);
            Run(model, ClimbSurfaceKind.Rock, 1f, 0f, 1f, out _, out _, out float rest, rest: true);

            Assert.That(moving, Is.EqualTo(6f).Within(1e-3f));
            Assert.That(hanging, Is.EqualTo(2f).Within(1e-3f));
            Assert.That(ladder, Is.EqualTo(0f));
            Assert.That(rest, Is.EqualTo(0f));
        }

        [Test]
        public void FastClimbingIsOneAndAHalfTimesFasterAndCostsDouble()
        {
            var model = new ClimbModel();
            model.Begin();

            Run(model, ClimbSurfaceKind.Rock, 1f, 0f, 1f, out _, out float up, out float stamina, fast: true);

            Assert.That(up, Is.EqualTo(1.8f).Within(1e-3f));
            Assert.That(stamina, Is.EqualTo(12f).Within(1e-3f));
        }

        [Test]
        public void ClimbJumpCovers1Point8MetresFor20Stamina()
        {
            var model = new ClimbModel();
            model.Begin();

            ClimbModel.StepResult start = model.Step(ClimbSurfaceKind.Rock, false, 0f, 1f, false, true, false, 50f, Dt);
            Assert.That(start.Jumped, Is.True);
            Assert.That(start.StaminaCost, Is.EqualTo(ClimbModel.JumpStamina));
            Assert.That(model.IsJumping, Is.True);

            Run(model, ClimbSurfaceKind.Rock, ClimbModel.JumpSeconds, 0f, 0f, out _, out float up, out float stamina);

            Assert.That(up, Is.EqualTo(ClimbModel.JumpDistance).Within(1e-3f));
            Assert.That(stamina, Is.EqualTo(0f), "the jump itself costs once");
            Assert.That(model.IsJumping, Is.False);
        }

        [Test]
        public void NoClimbJumpWithoutStaminaOrOnALadder()
        {
            var model = new ClimbModel();
            model.Begin();

            Assert.That(model.Step(ClimbSurfaceKind.Rock, false, 0f, 1f, false, true, false, 10f, Dt).Jumped, Is.False);
            Assert.That(model.Step(ClimbSurfaceKind.Ladder, false, 0f, 1f, false, true, false, 50f, Dt).Jumped, Is.False);
        }

        [Test]
        public void EmptyStaminaShakesOneSecondThenFalls()
        {
            var model = new ClimbModel();
            model.Begin();

            ClimbModel.StepResult first = model.Step(ClimbSurfaceKind.Rock, false, 0f, 1f, false, false, false, 0f, Dt);
            Assert.That(first.Shaking, Is.True);
            Assert.That(first.Outcome, Is.EqualTo(ClimbOutcome.Climbing));

            ClimbModel.StepResult before = Run(model, ClimbSurfaceKind.Rock, 0.95f, 0f, 1f, out _, out float up, out _, staminaStart: 0f);
            Assert.That(before.Outcome, Is.EqualTo(ClimbOutcome.Climbing), "still shaking");
            Assert.That(up, Is.EqualTo(0f), "no progress while shaking");

            ClimbModel.StepResult after = Run(model, ClimbSurfaceKind.Rock, 0.1f, 0f, 1f, out _, out _, out _, staminaStart: 0f);
            Assert.That(after.Outcome, Is.EqualTo(ClimbOutcome.Exhausted));
        }

        [Test]
        public void LaddersAndRestPointsNeverShake()
        {
            var model = new ClimbModel();
            model.Begin();

            Assert.That(model.Step(ClimbSurfaceKind.Ladder, false, 0f, 1f, false, false, false, 0f, Dt).Shaking, Is.False);
            Assert.That(model.Step(ClimbSurfaceKind.Rock, true, 0f, 0f, false, false, false, 0f, Dt).Shaking, Is.False);
        }

        [Test]
        public void DodgeLetsGo()
        {
            var model = new ClimbModel();
            model.Begin();

            Assert.That(model.Step(ClimbSurfaceKind.Vines, false, 0f, 1f, false, false, true, 80f, Dt).Outcome, Is.EqualTo(ClimbOutcome.LetGo));
        }

        [Test]
        public void DiagonalInputIsNotFaster()
        {
            var model = new ClimbModel();
            model.Begin();

            Run(model, ClimbSurfaceKind.Vines, 1f, 1f, 1f, out float right, out float up, out _);

            Assert.That(System.Math.Sqrt(right * right + up * up), Is.EqualTo(1.0).Within(1e-3));
        }
    }
}
