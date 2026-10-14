using Aetherfall.Progression;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The experience curve against the numbers of GDD 03 12.3 and the milestone table 12.5 (XP to the next level and total
    /// XP when reaching a level) and the level share examples of 12.3.
    /// </summary>
    [TestFixture]
    public sealed class XpCurveTests
    {
        [TestCase(1, 200)]
        [TestCase(5, 1030)]
        [TestCase(10, 2220)]
        [TestCase(15, 3750)]
        [TestCase(20, 5780)]
        [TestCase(30, 12000)]
        [TestCase(40, 22220)]
        [TestCase(50, 37780)]
        [TestCase(60, 60000)]
        [TestCase(70, 90220)]
        public void XpToNext_MatchesMilestones(int level, int expected)
        {
            Assert.That(XpCurve.Default.XpToNext(level), Is.EqualTo(expected));
        }

        [TestCase(1, 0)]
        [TestCase(5, 2020)]
        [TestCase(10, 9450)]
        [TestCase(15, 23450)]
        [TestCase(20, 46020)]
        [TestCase(30, 129050)]
        [TestCase(40, 291200)]
        [TestCase(50, 578470)]
        [TestCase(60, 1050200)]
        [TestCase(70, 1779050)]
        [TestCase(80, 2851020)]
        public void TotalXpAt_MatchesMilestones(int level, int expected)
        {
            Assert.That(XpCurve.Default.TotalXpAt(level), Is.EqualTo(expected));
        }

        [Test]
        public void MaxLevel_IsEightyWithoutFurtherXp()
        {
            XpCurve curve = XpCurve.Default;

            Assert.That(curve.MaxLevel, Is.EqualTo(80));
            Assert.That(curve.XpToNext(80), Is.EqualTo(0));
            Assert.That(curve.XpToNext(99), Is.EqualTo(0));
            Assert.That(curve.TotalToMaxLevel, Is.EqualTo(2851020));
        }

        [Test]
        public void EveryLevelBelowMax_NeedsARoundedPositiveAmount()
        {
            XpCurve curve = XpCurve.Default;
            for (int level = 1; level < curve.MaxLevel; level++)
            {
                int xp = curve.XpToNext(level);
                Assert.That(xp, Is.GreaterThan(0), "level " + level);
                Assert.That(xp % 10, Is.EqualTo(0), "level " + level + " is not rounded to 10");
                Assert.That(curve.TotalXpAt(level + 1), Is.EqualTo(curve.TotalXpAt(level) + xp));
            }
        }

        [TestCase(0, 1)]
        [TestCase(199, 1)]
        [TestCase(200, 2)]
        [TestCase(599, 2)]
        [TestCase(600, 3)]
        [TestCase(9450, 10)]
        [TestCase(2851019, 79)]
        [TestCase(2851020, 80)]
        [TestCase(99999999, 80)]
        public void LevelForTotalXp_FindsTheReachedLevel(long total, int expected)
        {
            Assert.That(XpCurve.Default.LevelForTotalXp(total), Is.EqualTo(expected));
        }

        [Test]
        public void LevelShare_UsesTheExamplesOfTheGdd()
        {
            XpCurve curve = XpCurve.Default;

            // GDD 03 12.3: "Quest 2 0,5 Lv bei Level 3 = 305 XP", "Grimmbart 0,6 Lv bei Level 7 = 888 XP".
            Assert.That(curve.LevelShareToXp(0.5f, 3), Is.EqualTo(305));
            Assert.That(curve.LevelShareToXp(0.6f, 7), Is.EqualTo(888));
            Assert.That(curve.LevelShareToXp(1f, 1), Is.EqualTo(200));
            Assert.That(curve.LevelShareToXp(0f, 5), Is.EqualTo(0));
            Assert.That(curve.LevelShareToXp(-1f, 5), Is.EqualTo(0));
            Assert.That(curve.LevelShareToXp(1f, 80), Is.EqualTo(curve.XpToNext(79)), "at the max level the last level counts");
        }

        [Test]
        public void Parameters_ChangeTheCurve()
        {
            var flat = new XpCurve(100f, 30f, 0f, 10);

            // Exponent 0: (L / 30)^0 = 1, so XP_next(L) = 100 × L × 2.
            Assert.That(flat.XpToNext(1), Is.EqualTo(200));
            Assert.That(flat.XpToNext(9), Is.EqualTo(1800));
            Assert.That(flat.XpToNext(10), Is.EqualTo(0));
            Assert.That(flat.MaxLevel, Is.EqualTo(10));
        }
    }
}
