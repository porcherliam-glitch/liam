using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Affix tiers of GDD 04 4.3: tier by item level (VI only with world tier 5 or mythic), tier choice 50/35/15 % (mythic
    /// always the highest), ranges interpolated between tier I and VI and rounded ("Lodernd" tier III = 9–12 %), uniform
    /// roll with the world tier floor (+3 % of the span per tier) and the upper half for mythic items.
    /// </summary>
    [TestFixture]
    public sealed class AffixTiersTests
    {
        private static AffixSpec Blazing()
        {
            return ItemTestCatalog.Affix(ItemTestCatalog.Blazing, AffixKind.Prefix, "element_zusatz", StatId.None, 4, 6, 16, 22, AffixSlots.AllWeapons);
        }

        [TestCase(1, 0, false, 1)]
        [TestCase(9, 0, false, 1)]
        [TestCase(10, 0, false, 2)]
        [TestCase(24, 0, false, 2)]
        [TestCase(25, 0, false, 3)]
        [TestCase(39, 0, false, 3)]
        [TestCase(40, 0, false, 4)]
        [TestCase(59, 0, false, 4)]
        [TestCase(60, 0, false, 5)]
        [TestCase(74, 0, false, 5)]
        [TestCase(80, 4, false, 5)]
        [TestCase(75, 5, false, 6)]
        [TestCase(80, 0, true, 6)]
        public void MaxTier_FollowsTheItemLevelBands(int itemLevel, int worldTier, bool mythic, int expected)
        {
            Assert.That(AffixTiers.MaxTier(itemLevel, worldTier, mythic), Is.EqualTo(expected));
        }

        [TestCase(1, 4f, 6f)]
        [TestCase(2, 6f, 9f)]
        [TestCase(3, 9f, 12f)]
        [TestCase(6, 16f, 22f)]
        public void Range_IsInterpolatedAndRounded(int tier, float min, float max)
        {
            Blazing().RangeForTier(tier, out float low, out float high);

            Assert.That(low, Is.EqualTo(min));
            Assert.That(high, Is.EqualTo(max));
        }

        [Test]
        public void ChooseTier_Is50_35_15Percent()
        {
            var random = new Pcg32Random(2024UL);
            var counts = new int[7];
            const int rolls = 100000;
            for (int i = 0; i < rolls; i++)
            {
                counts[AffixTiers.ChooseTier(5, random, false)]++;
            }

            Assert.That(counts[5] / (float)rolls, Is.EqualTo(0.50f).Within(0.01f));
            Assert.That(counts[4] / (float)rolls, Is.EqualTo(0.35f).Within(0.01f));
            Assert.That(counts[3] / (float)rolls, Is.EqualTo(0.15f).Within(0.01f));
            Assert.That(counts[1] + counts[2] + counts[6], Is.EqualTo(0));
        }

        [Test]
        public void ChooseTier_MythicAlwaysHighest_TierOneHasNoAlternative()
        {
            var random = new SequenceRandom(0.99f);

            Assert.That(AffixTiers.ChooseTier(6, random, true), Is.EqualTo(6));
            Assert.That(AffixTiers.ChooseTier(1, random, false), Is.EqualTo(1));
            Assert.That(AffixTiers.ChooseTier(2, random, false), Is.EqualTo(1), "tier II: 50 % II, 35 % I, the 15 % share does not exist");
        }

        [Test]
        public void RollValue_CoversTheWholeRange_WithoutWorldTier()
        {
            var random = new Pcg32Random(7UL);
            var seen = new bool[13];
            for (int i = 0; i < 2000; i++)
            {
                float value = AffixTiers.RollValue(Blazing(), 3, random, 0, false);
                Assert.That(value, Is.InRange(9f, 12f));
                Assert.That(value, Is.EqualTo((float)System.Math.Round(value)), "0 decimals");
                seen[(int)value] = true;
            }

            Assert.That(seen[9] && seen[10] && seen[11] && seen[12], Is.True);
        }

        [Test]
        public void RollValue_WorldTierRaisesTheFloor_MythicUsesTheUpperHalf()
        {
            var random = new Pcg32Random(8UL);
            for (int i = 0; i < 2000; i++)
            {
                // World tier 10: the lower 30 % of 9–12 fall away (9.9 → 10).
                Assert.That(AffixTiers.RollValue(Blazing(), 3, random, 10, false), Is.InRange(10f, 12f));

                // Mythic: upper half of 16–22 (19–22).
                Assert.That(AffixTiers.RollValue(Blazing(), 6, random, 0, true), Is.InRange(19f, 22f));
            }
        }

        [Test]
        public void RollValue_KeepsDecimals()
        {
            AffixSpec precise = ItemTestCatalog.Affix("affix.praezise", AffixKind.Prefix, "krit_chance", StatId.CritChance, 1f, 1.5f, 4f, 5f,
                AffixSlots.Ring);
            precise.Decimals = 1;
            var random = new Pcg32Random(9UL);
            for (int i = 0; i < 500; i++)
            {
                float value = AffixTiers.RollValue(precise, 1, random, 0, false);
                Assert.That(value, Is.InRange(1f, 1.5f));
                Assert.That(value * 10f, Is.EqualTo((float)System.Math.Round(value * 10f)).Within(1e-3f));
            }
        }
    }
}
