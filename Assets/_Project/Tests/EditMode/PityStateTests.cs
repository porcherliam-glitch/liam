using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Bad-luck protection of GDD 04 5.5: Z_L counts random equipment drops with item level ≥ 10 that are not legendary,
    /// M_Pity = 1 + 0.04 × max(0; Z_L − 50), Z_L = 200 guarantees the next legendary, every random legendary resets; the
    /// mythic counter Z_M (× (1 + 0.1 × max(0; Z_M − 10)), 30 = guaranteed). Counters are restorable for the save.
    /// </summary>
    [TestFixture]
    public sealed class PityStateTests
    {
        private static PityState WithLegendaryCounter(int count)
        {
            var pity = new PityState();
            pity.Restore(count, 0);
            return pity;
        }

        [TestCase(0, 1f)]
        [TestCase(50, 1f)]
        [TestCase(75, 2f)]
        [TestCase(100, 3f)]
        [TestCase(150, 5f)]
        [TestCase(199, 6.96f)]
        public void LegendaryMultiplier_MatchesTheGddTable(int counter, float expected)
        {
            PityState pity = WithLegendaryCounter(counter);

            Assert.That(pity.LegendaryMultiplier, Is.EqualTo(expected).Within(1e-4f));
            Assert.That(pity.LegendaryGuaranteed, Is.False);
        }

        [Test]
        public void Counter_CountsOnlyNonLegendaryDropsFromItemLevel10()
        {
            var pity = new PityState();
            pity.RecordEquipmentDrop(ItemRarity.Common, 9);
            pity.RecordEquipmentDrop(ItemRarity.Rare, 10);
            pity.RecordEquipmentDrop(ItemRarity.Epic, 30);

            Assert.That(pity.LegendaryCounter, Is.EqualTo(2));

            pity.RecordEquipmentDrop(ItemRarity.Legendary, 30);
            Assert.That(pity.LegendaryCounter, Is.EqualTo(0), "a random legendary resets Z_L");

            pity.Restore(80, 0);
            pity.RecordEquipmentDrop(ItemRarity.Legendary, 5);
            Assert.That(pity.LegendaryCounter, Is.EqualTo(0), "also a boss special roll below item level 10 resets Z_L");
        }

        [Test]
        public void Counter200_GuaranteesTheNextLegendary_AndResets()
        {
            PityState pity = WithLegendaryCounter(PityState.LegendaryGuarantee);
            Assert.That(pity.LegendaryGuaranteed, Is.True);

            // Even a roll of 0.0 (Common) becomes Legendary.
            ItemRarity rarity = RarityRoller.Roll(20, 1, 15f, 0, pity, new SequenceRandom(0f));

            Assert.That(rarity, Is.EqualTo(ItemRarity.Legendary));
            Assert.That(pity.LegendaryCounter, Is.EqualTo(0));
        }

        [Test]
        public void Roll_CountsForPity_UnlessTheEntryIsExcluded()
        {
            var pity = new PityState();
            RarityRoller.Roll(20, 1, 15f, 0, pity, new SequenceRandom(0f));
            RarityRoller.Roll(20, 1, 15f, 0, pity, new SequenceRandom(0f), false);

            Assert.That(pity.LegendaryCounter, Is.EqualTo(1));
        }

        [Test]
        public void Guarantee_NeedsItemLevel10()
        {
            PityState pity = WithLegendaryCounter(PityState.LegendaryGuarantee);

            Assert.That(RarityRoller.Roll(9, 1, 15f, 0, pity, new SequenceRandom(0f)), Is.EqualTo(ItemRarity.Common));
            Assert.That(pity.LegendaryCounter, Is.EqualTo(PityState.LegendaryGuarantee), "drops below item level 10 do not count");
        }

        [Test]
        public void MythicCounter_RaisesTheShare_AndGuaranteesAt30()
        {
            var pity = new PityState();
            pity.Restore(0, 20);
            Assert.That(pity.MythicMultiplier, Is.EqualTo(2f).Within(1e-5f));

            pity.Restore(PityState.LegendaryGuarantee, PityState.MythicGuarantee);
            Assert.That(pity.MythicGuaranteed, Is.True);

            // Guaranteed legendary at world tier 1, item level 60, and the mythic check is guaranteed as well (roll 0.99 > 1 %).
            ItemRarity rarity = RarityRoller.Roll(60, 1, 15f, 1, pity, new SequenceRandom(0.99f));

            Assert.That(rarity, Is.EqualTo(ItemRarity.Mythic));
            Assert.That(pity.MythicCounter, Is.EqualTo(0));
            Assert.That(pity.LegendaryCounter, Is.EqualTo(0));
        }

        [Test]
        public void LegendaryThatStaysLegendary_RaisesTheMythicCounter()
        {
            var pity = new PityState();
            pity.Restore(PityState.LegendaryGuarantee, 3);

            ItemRarity rarity = RarityRoller.Roll(60, 1, 15f, 1, pity, new SequenceRandom(0.99f));

            Assert.That(rarity, Is.EqualTo(ItemRarity.Legendary));
            Assert.That(pity.MythicCounter, Is.EqualTo(4));
        }

        [Test]
        public void Restore_ClampsNegativeValues()
        {
            var pity = new PityState();
            pity.Restore(-4, -1);

            Assert.That(pity.LegendaryCounter, Is.EqualTo(0));
            Assert.That(pity.MythicCounter, Is.EqualTo(0));
        }
    }
}
