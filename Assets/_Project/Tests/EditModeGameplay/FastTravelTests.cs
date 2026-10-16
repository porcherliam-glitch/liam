using Aetherfall.Player;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Fast travel (S50, GDD 03 3.4): the rules that block it (no map, not unlocked, combat, overloaded, a save lock, already
    /// there) in their order, and the travel time from the distance at mount speed scaled like the game clock.
    /// </summary>
    [TestFixture]
    public sealed class FastTravelTests
    {
        private static FastTravelBlock Check(bool map = true, bool unlocked = true, bool combat = false, bool overloaded = false, bool locked = false,
            float distance = 200f)
        {
            return FastTravelRules.Check(new FastTravelContext(map, unlocked, combat, overloaded, locked, distance));
        }

        [Test]
        public void TravelIsFreeWithoutAnyBlock()
        {
            Assert.That(Check(), Is.EqualTo(FastTravelBlock.None));
        }

        [Test]
        public void EveryBlockHasItsReasonInOrder()
        {
            Assert.That(Check(map: false, combat: true), Is.EqualTo(FastTravelBlock.NoMap), "crypt and interiors first");
            Assert.That(Check(unlocked: false, combat: true), Is.EqualTo(FastTravelBlock.NotUnlocked));
            Assert.That(Check(combat: true, overloaded: true), Is.EqualTo(FastTravelBlock.InCombat));
            Assert.That(Check(overloaded: true, locked: true), Is.EqualTo(FastTravelBlock.Overloaded));
            Assert.That(Check(locked: true), Is.EqualTo(FastTravelBlock.SaveLocked), "falling, climbing, boss fight, timed stage");
            Assert.That(Check(distance: 5f), Is.EqualTo(FastTravelBlock.AlreadyThere));
        }

        [TestCase(0f, 0.0)]
        [TestCase(234f, 0.15)]
        [TestCase(4680f, 3.0)]
        public void TravelTimeIsTheRideScaledLikeTheClock(float metres, double hours)
        {
            // 234 m at 13 m/s = 18 s of riding; a game day of 2880 s = 30 game minutes per real minute: 0.15 h = 9 minutes.
            Assert.That(FastTravelRules.TravelHours(metres, 2880.0), Is.EqualTo(hours).Within(1e-6));
        }

        [Test]
        public void ALongerDayMakesTheTravelShorterInGameTime()
        {
            Assert.That(FastTravelRules.TravelHours(234f, 5760.0), Is.EqualTo(0.075).Within(1e-6));
        }

        [TestCase(0.01, "1 Min.")]
        [TestCase(0.15, "9 Min.")]
        [TestCase(1.0, "1 Std.")]
        [TestCase(1.25, "1 Std. 15 Min.")]
        public void TravelTimeReadsInGerman(double hours, string text)
        {
            Assert.That(FastTravelRules.Describe(hours), Is.EqualTo(text));
        }
    }
}
