using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="NavigationRepeater"/> (GDD 05 1.4: step, 0.4 s delay, 12 steps/s).</summary>
    [TestFixture]
    public sealed class NavigationRepeaterTests
    {
        [TestCase(0f, 1f, NavDirection.Up)]
        [TestCase(0f, -1f, NavDirection.Down)]
        [TestCase(1f, 0f, NavDirection.Right)]
        [TestCase(-1f, 0f, NavDirection.Left)]
        [TestCase(0.4f, 0.3f, NavDirection.None)]
        [TestCase(0.6f, 0.7f, NavDirection.Up)]
        [TestCase(-0.8f, 0.6f, NavDirection.Left)]
        [TestCase(float.NaN, 0f, NavDirection.None)]
        public void DirectionOf_UsesTheDominantAxisAboveFiftyPercent(float x, float y, NavDirection expected)
        {
            Assert.That(NavigationRepeater.DirectionOf(x, y), Is.EqualTo(expected));
        }

        [Test]
        public void Update_StepsOnPress_ThenRepeatsAfterTheDelayAtTwelvePerSecond()
        {
            var repeater = new NavigationRepeater();
            int steps = 0;
            const float dt = 1f / 120f;
            Assert.That(repeater.Update(0f, -1f, dt), Is.EqualTo(NavDirection.Down));
            steps++;
            float time = 0f;
            int stepsBeforeDelay = 0;
            while (time < 1.4f)
            {
                time += dt;
                if (repeater.Update(0f, -1f, dt) == NavDirection.Down)
                {
                    steps++;
                    if (time < 0.4f - 0.0001f)
                    {
                        stepsBeforeDelay++;
                    }
                }
            }

            Assert.That(stepsBeforeDelay, Is.EqualTo(0), "no repeat during the first 0.4 s");
            // 1 press + 1.0 s of repeating at 12/s (+1 at the start of the repeat phase).
            Assert.That(steps, Is.InRange(12, 14));
        }

        [Test]
        public void Update_ReleaseAndPressAgain_StepsImmediately()
        {
            var repeater = new NavigationRepeater();
            Assert.That(repeater.Update(1f, 0f, 0.016f), Is.EqualTo(NavDirection.Right));
            Assert.That(repeater.Update(1f, 0f, 0.016f), Is.EqualTo(NavDirection.None));
            Assert.That(repeater.Update(0f, 0f, 0.016f), Is.EqualTo(NavDirection.None));
            Assert.That(repeater.Update(1f, 0f, 0.016f), Is.EqualTo(NavDirection.Right));
        }

        [Test]
        public void BlockUntilNeutral_IgnoresADirectionHeldFromBefore_UntilItWasReleasedOnce()
        {
            var repeater = new NavigationRepeater();
            repeater.BlockUntilNeutral();

            // Held for 1 s: no step, also not after the repeat delay of 0.4 s.
            for (int i = 0; i < 60; i++)
            {
                Assert.That(repeater.Update(0f, 1f, 1f / 60f), Is.EqualTo(NavDirection.None), "frame " + i);
            }

            Assert.That(repeater.WaitsForNeutral, Is.True);
            Assert.That(repeater.Update(0.2f, 0.1f, 0.016f), Is.EqualTo(NavDirection.None), "below the threshold = neutral");
            Assert.That(repeater.WaitsForNeutral, Is.False);
            Assert.That(repeater.Update(0f, 1f, 0.016f), Is.EqualTo(NavDirection.Up), "a new press steps at once");
        }

        [Test]
        public void Reset_DoesNotLiftTheBlock()
        {
            var repeater = new NavigationRepeater();
            repeater.BlockUntilNeutral();
            repeater.Reset();
            Assert.That(repeater.Update(0f, -1f, 0.016f), Is.EqualTo(NavDirection.None));
            Assert.That(repeater.WaitsForNeutral, Is.True);
        }

        [Test]
        public void Update_ChangingDirection_StepsAtOnce()
        {
            var repeater = new NavigationRepeater();
            repeater.Update(0f, 1f, 0.016f);
            Assert.That(repeater.Update(0f, -1f, 0.016f), Is.EqualTo(NavDirection.Down));
            Assert.That(repeater.Held, Is.EqualTo(NavDirection.Down));
        }
    }
}
