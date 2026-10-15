using Aetherfall.AI;
using Aetherfall.Companions;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Ser Maren in full (GDD 03 13.1, GDD 01 10.3/10.4): the four combat modes decide whom she fights and where she walks;
    /// loyalty gives a warning at 20 and makes her leave at 10; the bar shows a word; flag ids follow the companion id;
    /// resting at the campfire lasts until 8:00 at night and three hours in the day.
    /// </summary>
    [TestFixture]
    public sealed class CompanionModeAndLoyaltyTests
    {
        private static CompanionSenses Fight(CompanionMode mode, float targetX, float targetZ, float selfX = 1.5f, float selfZ = -2.2f)
        {
            return new CompanionSenses
            {
                Self = new FlatPoint(selfX, selfZ),
                Player = new FlatPoint(0f, 0f),
                PlayerYaw = 0f,
                Joined = true,
                Mode = mode,
                HasTarget = true,
                Target = new FlatPoint(targetX, targetZ),
                AttackReady = true
            };
        }

        [Test]
        public void DefensiveFightsNearThePlayerOnly()
        {
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Defensive, 0f, 6f)), Is.True);
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Defensive, 0f, 15f)), Is.False, "9 m leash from the player");
        }

        [Test]
        public void AggressiveChasesUpTo25Metres()
        {
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Aggressive, 0f, 20f)), Is.True);
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Aggressive, 0f, 30f)), Is.False);
        }

        [Test]
        public void SupportiveOnlyFightsWhatComesClose()
        {
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Supportive, 1.5f, 0f)), Is.True, "2.2 m from her");
            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Supportive, 0f, 5f)), Is.False, "7 m from her");
        }

        [Test]
        public void PassiveNeverFightsAndWalksBehind()
        {
            var brain = new CompanionBrain();
            CompanionDecision decision = brain.Decide(Fight(CompanionMode.Passive, 1.5f, -1f));

            Assert.That(CompanionBrain.MayFight(Fight(CompanionMode.Passive, 1.5f, -1f)), Is.False);
            Assert.That(decision.StartAttack, Is.False);
            FlatPoint spot = CompanionBrain.FollowSpot(new FlatPoint(0f, 0f), 0f, 1, CompanionMode.Passive);
            Assert.That(spot.Z, Is.EqualTo(-3f).Within(1e-4f), "GDD 03 13.1: follows 3 m behind");
        }

        [Test]
        public void SupportiveFollowsFartherBack()
        {
            FlatPoint spot = CompanionBrain.FollowSpot(new FlatPoint(0f, 0f), 0f, 1, CompanionMode.Supportive);

            Assert.That(spot.Z, Is.EqualTo(-CompanionBrain.SupportBehindDistance).Within(1e-4f));
        }

        [TestCase(40, 18, false, CompanionLoyaltyStep.Warns)]
        [TestCase(40, 18, true, CompanionLoyaltyStep.None)]
        [TestCase(20, 10, true, CompanionLoyaltyStep.Leaves)]
        [TestCase(25, 5, false, CompanionLoyaltyStep.Leaves)]
        [TestCase(10, 8, true, CompanionLoyaltyStep.None)]
        [TestCase(18, 25, true, CompanionLoyaltyStep.None)]
        [TestCase(40, 45, false, CompanionLoyaltyStep.None)]
        public void LoyaltyWarnsAt20AndLeavesAt10(int before, int after, bool warned, CompanionLoyaltyStep step)
        {
            Assert.That(CompanionLoyalty.StepFor(before, after, warned), Is.EqualTo(step));
        }

        [TestCase(5, "Abweisend")]
        [TestCase(25, "Kühl")]
        [TestCase(40, "Kollegial")]
        [TestCase(65, "Vertraut")]
        [TestCase(95, "Verbunden")]
        public void TheBarShowsAWord(int loyalty, string word)
        {
            Assert.That(CompanionLoyalty.TierWord(loyalty), Is.EqualTo(word));
        }

        [Test]
        public void FlagsFollowTheCompanionId()
        {
            const string maren = "npc.begleiter.maren_falkenried";

            Assert.That(CompanionLoyalty.LoyaltyFlag(maren), Is.EqualTo("stat.begleiter.maren.loyalitaet"));
            Assert.That(CompanionLoyalty.InPartyFlag("companion.maren_falkenried"), Is.EqualTo("flag.begleiter.maren.in_gruppe"));
            Assert.That(CompanionLoyalty.ModeFlag(maren), Is.EqualTo("stat.begleiter.maren.kampfmodus"));
            Assert.That(CompanionLoyalty.DisplayName(maren), Is.EqualTo("Maren"));
            Assert.That(CompanionLoyalty.Clamp(130), Is.EqualTo(100));
            Assert.That(CompanionLoyalty.Clamp(-4), Is.EqualTo(0));
        }

        [TestCase(22, 0, 10f)]
        [TestCase(18, 30, 13.5f)]
        [TestCase(2, 0, 6f)]
        [TestCase(10, 0, 3f)]
        public void RestingLastsUntilMorningAtNight(int hour, int minute, float hours)
        {
            Assert.That(CampfireRest.RestHours(hour, minute), Is.EqualTo(hours).Within(1e-4f));
        }
    }
}
