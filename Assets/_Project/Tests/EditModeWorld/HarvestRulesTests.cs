using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Rules of harvest nodes (S30, GDD 04 6.10): stored harvest time, respawn in game days, the 50 m rule, time of day.</summary>
    [TestFixture]
    public sealed class HarvestRulesTests
    {
        [Test]
        public void EncodeDecode_RoundTripsWholeMinutes()
        {
            int state = HarvestRules.EncodeHarvested(600.7d);

            Assert.That(state, Is.EqualTo(601));
            Assert.That(HarvestRules.TryDecodeHarvested(state, out double at), Is.True);
            Assert.That(at, Is.EqualTo(600d));
        }

        [Test]
        public void ZeroState_MeansRipe()
        {
            Assert.That(HarvestRules.TryDecodeHarvested(0, out _), Is.False);
            Assert.That(HarvestRules.TryDecodeHarvested(-3, out _), Is.False);
        }

        [Test]
        public void Encode_NeverReturnsZero_AndClampsHugeTimes()
        {
            Assert.That(HarvestRules.EncodeHarvested(0d), Is.EqualTo(1));
            Assert.That(HarvestRules.EncodeHarvested(-50d), Is.EqualTo(1));
            Assert.That(HarvestRules.EncodeHarvested(double.NaN), Is.EqualTo(1));
            Assert.That(HarvestRules.EncodeHarvested(1e12), Is.EqualTo(int.MaxValue));
        }

        [Test]
        public void CommonHerb_RespawnsAfterOneGameDay()
        {
            double respawn = HarvestRules.RespawnMinutes(1d);

            Assert.That(respawn, Is.EqualTo(1440d));
            Assert.That(HarvestRules.IsRespawnDue(600d, 600d + 1439d, respawn), Is.False);
            Assert.That(HarvestRules.IsRespawnDue(600d, 600d + 1440d, respawn), Is.True);
        }

        [Test]
        public void RareHerb_RespawnsAfterThreeGameDays()
        {
            double respawn = HarvestRules.RespawnMinutes(3d);

            Assert.That(respawn, Is.EqualTo(4320d));
            Assert.That(HarvestRules.IsRespawnDue(0d, 4319d, respawn), Is.False);
            Assert.That(HarvestRules.IsRespawnDue(0d, 4320d, respawn), Is.True);
        }

        [Test]
        public void NotDue_WhenTheClockIsBeforeTheHarvest()
        {
            Assert.That(HarvestRules.IsRespawnDue(5000d, 100d, 1440d), Is.False);
        }

        [Test]
        public void Regrows_OnlyUnseenOrFromFiftyMetres()
        {
            Assert.That(HarvestRules.MayRegrow(false, 49.9f), Is.False);
            Assert.That(HarvestRules.MayRegrow(false, 50f), Is.True);
            Assert.That(HarvestRules.MayRegrow(true, 2f), Is.True, "on load the scene was not in view");
        }

        [TestCase(21.99, false)]
        [TestCase(22.0, true)]
        [TestCase(23.5, true)]
        [TestCase(3.99, true)]
        [TestCase(4.0, false)]
        [TestCase(12.0, false)]
        public void NightWindow_WrapsMidnight(double hour, bool expected)
        {
            Assert.That(HarvestRules.IsActiveAt(hour, 22d, 4d), Is.EqualTo(expected));
        }

        [Test]
        public void EqualHours_MeanAlwaysActive()
        {
            Assert.That(HarvestRules.IsActiveAt(13.5d, 0d, 0d), Is.True);
            Assert.That(HarvestRules.IsActiveAt(0d, 0d, 0d), Is.True);
        }

        [Test]
        public void Visual_FollowsHarvestAndWindow()
        {
            Assert.That(HarvestRules.Visual(false, true), Is.EqualTo(HarvestVisual.Ripe));
            Assert.That(HarvestRules.Visual(false, false), Is.EqualTo(HarvestVisual.Waiting));
            Assert.That(HarvestRules.Visual(true, true), Is.EqualTo(HarvestVisual.Hidden));
            Assert.That(HarvestRules.Visual(true, false), Is.EqualTo(HarvestVisual.Hidden));
        }
    }
}
