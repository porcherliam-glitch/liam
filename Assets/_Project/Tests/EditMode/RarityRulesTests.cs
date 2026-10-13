using Aetherfall.Items;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The rarity table of GDD 04 3.1: colours (hex from GDD 05 1.10), affix counts, base value and trade factors, base drop
    /// weights, luck factors k(r), minimum item levels, beam heights and the stable ids used in saves and events.
    /// </summary>
    [TestFixture]
    public sealed class RarityRulesTests
    {
        [TestCase(ItemRarity.Common, "#A6A6A6", 0)]
        [TestCase(ItemRarity.Uncommon, "#4CC35A", 1)]
        [TestCase(ItemRarity.Rare, "#3D8BFF", 2)]
        [TestCase(ItemRarity.Epic, "#A855F7", 3)]
        [TestCase(ItemRarity.Legendary, "#FF8C1A", 3)]
        [TestCase(ItemRarity.Mythic, "#E53935", 4)]
        [TestCase(ItemRarity.Set, "#F2D23C", 2)]
        public void ColourAndAffixCount_MatchGdd(ItemRarity rarity, string hex, int affixes)
        {
            Assert.That(RarityRules.Color(rarity).Hex, Is.EqualTo(hex));
            Assert.That(RarityRules.AffixCount(rarity), Is.EqualTo(affixes));
        }

        [TestCase(ItemRarity.Common, 1.00f, 1f, 6000)]
        [TestCase(ItemRarity.Uncommon, 1.10f, 1.5f, 2800)]
        [TestCase(ItemRarity.Rare, 1.20f, 3f, 900)]
        [TestCase(ItemRarity.Epic, 1.30f, 6f, 300)]
        [TestCase(ItemRarity.Legendary, 1.40f, 15f, 45)]
        [TestCase(ItemRarity.Mythic, 1.55f, 30f, 0)]
        [TestCase(ItemRarity.Set, 1.30f, 8f, 0)]
        public void Factors_AndBaseDropWeights_MatchGdd(ItemRarity rarity, float baseFactor, float tradeFactor, int dropWeight)
        {
            Assert.That(RarityRules.BaseValueFactor(rarity), Is.EqualTo(baseFactor).Within(1e-6f));
            Assert.That(RarityRules.TradeValueFactor(rarity), Is.EqualTo(tradeFactor).Within(1e-6f));
            Assert.That(RarityRules.BaseDropWeight(rarity), Is.EqualTo(dropWeight));
        }

        [TestCase(ItemRarity.Common, 0f, 1)]
        [TestCase(ItemRarity.Uncommon, 0.3f, 1)]
        [TestCase(ItemRarity.Rare, 0.75f, 3)]
        [TestCase(ItemRarity.Epic, 1.5f, 10)]
        [TestCase(ItemRarity.Legendary, 2.0f, 10)]
        [TestCase(ItemRarity.Mythic, 0f, 60)]
        public void LuckFactor_AndMinimumItemLevel_MatchGdd(ItemRarity rarity, float k, int minItemLevel)
        {
            Assert.That(RarityRules.LuckFactor(rarity), Is.EqualTo(k).Within(1e-6f));
            Assert.That(RarityRules.MinItemLevel(rarity), Is.EqualTo(minItemLevel));
        }

        [Test]
        public void BaseDropWeights_GiveTheSharesOfTheGddTable()
        {
            float total = 0f;
            for (int r = 0; r < RarityRoller.RolledRarityCount; r++)
            {
                total += RarityRules.BaseDropWeight((ItemRarity)r);
            }

            Assert.That(total, Is.EqualTo(10045f));
            Assert.That(RarityRules.BaseDropWeight(ItemRarity.Common) / total, Is.EqualTo(0.597f).Within(0.0005f));
            Assert.That(RarityRules.BaseDropWeight(ItemRarity.Uncommon) / total, Is.EqualTo(0.279f).Within(0.0005f));
            Assert.That(RarityRules.BaseDropWeight(ItemRarity.Rare) / total, Is.EqualTo(0.090f).Within(0.0005f));
            Assert.That(RarityRules.BaseDropWeight(ItemRarity.Epic) / total, Is.EqualTo(0.030f).Within(0.0005f));
            Assert.That(RarityRules.BaseDropWeight(ItemRarity.Legendary) / total, Is.EqualTo(0.0045f).Within(0.00005f));
        }

        [Test]
        public void LegendaryMythicAndSet_LockAutomatically()
        {
            Assert.That(RarityRules.LocksAutomatically(ItemRarity.Epic), Is.False);
            Assert.That(RarityRules.LocksAutomatically(ItemRarity.Legendary), Is.True);
            Assert.That(RarityRules.LocksAutomatically(ItemRarity.Mythic), Is.True);
            Assert.That(RarityRules.LocksAutomatically(ItemRarity.Set), Is.True);
        }

        [Test]
        public void BeamHeights_GrowWithRarity_CommonHasNone()
        {
            Assert.That(RarityRules.BeamHeight(ItemRarity.Common), Is.EqualTo(0f));
            Assert.That(RarityRules.BeamHeight(ItemRarity.Rare), Is.GreaterThan(RarityRules.BeamHeight(ItemRarity.Uncommon)));
            Assert.That(RarityRules.BeamHeight(ItemRarity.Epic), Is.GreaterThan(RarityRules.BeamHeight(ItemRarity.Rare)));
            Assert.That(RarityRules.BeamHeight(ItemRarity.Legendary), Is.GreaterThan(RarityRules.BeamHeight(ItemRarity.Epic)));
            Assert.That(RarityRules.BeamHeight(ItemRarity.Mythic), Is.GreaterThan(RarityRules.BeamHeight(ItemRarity.Legendary)));
        }

        [Test]
        public void Ids_RoundTrip_AndSetRanksLikeEpic()
        {
            for (int r = 0; r < RarityRules.Count; r++)
            {
                var rarity = (ItemRarity)r;
                Assert.That(ItemRarityIds.TryParse(ItemRarityIds.ToId(rarity), out ItemRarity back), Is.True);
                Assert.That(back, Is.EqualTo(rarity));
            }

            Assert.That(ItemRarityIds.ToId(ItemRarity.Rare), Is.EqualTo("selten"));
            Assert.That(ItemRarityIds.TryParse("unbekannt", out _), Is.False);
            Assert.That(RarityRules.Rank(ItemRarity.Set), Is.EqualTo(RarityRules.Rank(ItemRarity.Epic)));
        }
    }
}
