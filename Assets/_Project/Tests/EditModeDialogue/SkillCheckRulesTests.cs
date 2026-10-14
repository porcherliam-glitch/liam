using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.NPC;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// The rules of dialogue checks (GDD 02, 12.3): thresholds of the difficulty tiers, the attribute of each check, value =
    /// attribute + 2 × rank + situation (at most ±6), level advantage, relationship bonus, dice mode, bribe prices and the
    /// deterministic seeds.
    /// </summary>
    [TestFixture]
    public sealed class SkillCheckRulesTests
    {
        [TestCase(CheckDifficulty.Easy, 10)]
        [TestCase(CheckDifficulty.EasyPlus, 12)]
        [TestCase(CheckDifficulty.Medium, 14)]
        [TestCase(CheckDifficulty.MediumPlus, 16)]
        [TestCase(CheckDifficulty.Hard, 18)]
        [TestCase(CheckDifficulty.VeryHard, 24)]
        [TestCase(CheckDifficulty.Legendary, 30)]
        public void Thresholds_FollowTheGdd(CheckDifficulty difficulty, int threshold)
        {
            Assert.That(SkillCheckRules.ThresholdOf(difficulty), Is.EqualTo(threshold));
        }

        [TestCase(SkillCheckType.Persuade, 10, 16, StatId.Charisma)]
        [TestCase(SkillCheckType.Lie, 10, 16, StatId.Charisma)]
        [TestCase(SkillCheckType.Intimidate, 10, 16, StatId.Strength)]
        [TestCase(SkillCheckType.Intimidate, 16, 10, StatId.Charisma)]
        [TestCase(SkillCheckType.Intimidate, 12, 12, StatId.Charisma)]
        public void Attribute_IsCharisma_OrForIntimidationTheHigherOne(SkillCheckType type, int charisma, int strength, StatId expected)
        {
            Assert.That(SkillCheckRules.AttributeOf(type, charisma, strength), Is.EqualTo(expected));
        }

        [Test]
        public void Value_AddsTwiceTheRank_AndTheClampedSituation()
        {
            Assert.That(SkillCheckRules.Value(10, 0, 0), Is.EqualTo(10));
            Assert.That(SkillCheckRules.Value(10, 2, 0), Is.EqualTo(14));
            Assert.That(SkillCheckRules.Value(10, 0, 9), Is.EqualTo(16), "situation at most +6");
            Assert.That(SkillCheckRules.Value(10, 0, -9), Is.EqualTo(4), "situation at least -6");
            Assert.That(SkillCheckRules.Value(10, -3, 0), Is.EqualTo(10), "negative ranks count as 0");
        }

        [TestCase(1, 4, 0)]
        [TestCase(4, 4, 0)]
        [TestCase(6, 4, 0)]
        [TestCase(7, 4, 2)]
        [TestCase(10, 4, 4)]
        [TestCase(30, 4, 6)]
        [TestCase(10, 0, 0)]
        public void LevelBonus_IsTwoPerThreeLevels_AtMostSix(int player, int npc, int bonus)
        {
            Assert.That(SkillCheckRules.LevelBonus(player, npc), Is.EqualTo(bonus));
        }

        [TestCase(-100, -4)]
        [TestCase(-50, -4)]
        [TestCase(-49, -2)]
        [TestCase(-10, -2)]
        [TestCase(-9, 0)]
        [TestCase(9, 0)]
        [TestCase(10, 2)]
        [TestCase(49, 2)]
        [TestCase(50, 4)]
        [TestCase(100, 4)]
        public void RelationshipBonus_FollowsTheTiers(int relationship, int bonus)
        {
            Assert.That(SkillCheckRules.RelationshipBonus(relationship), Is.EqualTo(bonus));
        }

        [Test]
        public void RelationshipBonus_UsesTheSameTiersAsTheNpcSystem()
        {
            // The tier limits live twice (Dialogue may not reference NPC, architecture 3.3): both must agree for every value.
            for (int value = RelationshipRules.Min; value <= RelationshipRules.Max; value++)
            {
                int expected;
                switch (RelationshipRules.TierOf(value))
                {
                    case RelationshipTier.Enemy: expected = -4; break;
                    case RelationshipTier.Dislike: expected = -2; break;
                    case RelationshipTier.Friendly: expected = 2; break;
                    case RelationshipTier.Trusted: expected = 4; break;
                    default: expected = 0; break;
                }

                Assert.That(SkillCheckRules.RelationshipBonus(value), Is.EqualTo(expected), "relationship " + value);
            }
        }

        [Test]
        public void Deterministic_SucceedsAtTheThreshold()
        {
            Assert.That(SkillCheckRules.Succeeds(12, 12), Is.True);
            Assert.That(SkillCheckRules.Succeeds(11, 12), Is.False);
        }

        [Test]
        public void Dice_RollPlusValueMinusTen_ReachesTheThreshold()
        {
            Assert.That(SkillCheckRules.DiceSucceeds(12, 10, 12), Is.True);
            Assert.That(SkillCheckRules.DiceSucceeds(11, 10, 12), Is.False);
            Assert.That(SkillCheckRules.DiceSucceeds(9, 13, 12), Is.True);
            Assert.That(SkillCheckRules.DiceChance(10, 12), Is.EqualTo(0.45f).Within(0.0001f));
            Assert.That(SkillCheckRules.DiceChance(30, 12), Is.EqualTo(1f));
            Assert.That(SkillCheckRules.DiceChance(-10, 12), Is.EqualTo(0f));
        }

        [Test]
        public void Formatter_ShowsTheCheck_AsTheGddDoes()
        {
            var met = new SkillCheckResult(SkillCheckType.Persuade, 12, 13, StatId.Charisma, 0, true, 0, 1f, false);
            var missed = new SkillCheckResult(SkillCheckType.Persuade, 12, 9, StatId.Charisma, 0, false, 0, 0f, false);
            var dice = new SkillCheckResult(SkillCheckType.Lie, 12, 13, StatId.Charisma, 0, true, 7, 0.65f, false);
            var lost = new SkillCheckResult(SkillCheckType.Intimidate, 14, 9, StatId.Strength, 0, false, 0, 0f, true);

            Assert.That(DialogueOptionFormatter.CheckText(met, false), Is.EqualTo("[Überzeugen 12]"));
            Assert.That(DialogueOptionFormatter.CheckText(missed, false), Is.EqualTo("[Überzeugen 12 · dein Wert 9]"));
            Assert.That(DialogueOptionFormatter.CheckText(dice, true), Is.EqualTo("[Lügen · 65 %]"));
            Assert.That(DialogueOptionFormatter.CheckText(lost, true), Is.EqualTo("[Einschüchtern · gescheitert]"));
        }

        [TestCase(80, 1f, 10, 80)]
        [TestCase(80, 1f, 15, 72)]
        [TestCase(80, 1f, 30, 56)]
        [TestCase(80, 1.5f, 10, 120)]
        [TestCase(80, 1f, 6, 86)]
        [TestCase(1, 0.1f, 30, 1)]
        public void BribePrice_UsesGreed_AndCharisma_DiscountAtMost30Percent(int basePrice, float greed, int charisma, int price)
        {
            Assert.That(BribePricing.Price(basePrice, greed, charisma), Is.EqualTo(price));
        }

        [Test]
        public void Seeds_AreStable_AndDependOnEveryPart()
        {
            ulong seed = DialogueSeeds.For("npc.a", 3, "dlg.a", "n010");

            Assert.That(DialogueSeeds.For("npc.a", 3, "dlg.a", "n010"), Is.EqualTo(seed));
            Assert.That(DialogueSeeds.For("npc.b", 3, "dlg.a", "n010"), Is.Not.EqualTo(seed));
            Assert.That(DialogueSeeds.For("npc.a", 4, "dlg.a", "n010"), Is.Not.EqualTo(seed));
            Assert.That(DialogueSeeds.For("npc.a", 3, "dlg.b", "n010"), Is.Not.EqualTo(seed));
            Assert.That(DialogueSeeds.For("npc.a", 3, "dlg.a", "n020"), Is.Not.EqualTo(seed));
        }

        [Test]
        public void GermanNames_AndAttributeColours()
        {
            Assert.That(SkillCheckRules.GermanName(SkillCheckType.Persuade), Is.EqualTo("Überzeugen"));
            Assert.That(SkillCheckRules.GermanName(SkillCheckType.Intimidate), Is.EqualTo("Einschüchtern"));
            Assert.That(SkillCheckRules.GermanName(SkillCheckType.Lie), Is.EqualTo("Lügen"));
            Assert.That(SkillCheckRules.AttributeColorKey(StatId.Strength), Is.EqualTo("strength"));
            Assert.That(SkillCheckRules.AttributeColorKey(StatId.Charisma), Is.EqualTo("charisma"));
        }
    }
}
