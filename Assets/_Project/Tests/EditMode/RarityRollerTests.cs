using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Luck formula and rarity roll of GDD 04 5.2/5.3: B = luck + 15 × LQ + difficulty + 10 × world tier + event, cap
    /// B_eff ≤ 175, w' = w × (1 + k × B_eff / 100), legendary × world tier × pity × 2 at LQ 6, minimum rarity lifts instead of
    /// removing, rarity minimum item levels, and the examples of the GDD tables.
    /// </summary>
    [TestFixture]
    public sealed class RarityRollerTests
    {
        private static float[] Shares(int itemLevel, int lootQuality, float bonus, int worldTier, float pity)
        {
            float effective = LuckFormula.Effective(bonus);
            var weights = new float[RarityRoller.RolledRarityCount];
            float total = 0f;
            for (int r = 0; r < weights.Length; r++)
            {
                weights[r] = RarityRoller.Weight((ItemRarity)r, itemLevel, lootQuality, effective, worldTier, pity);
                total += weights[r];
            }

            for (int r = 0; r < weights.Length; r++)
            {
                weights[r] /= total;
            }

            return weights;
        }

        [TestCase(0f, 0.597f, 0.279f, 0.090f, 0.030f, 0.0045f)]
        [TestCase(15f, 0.580f, 0.283f, 0.097f, 0.036f, 0.0057f)]
        [TestCase(30f, 0.563f, 0.286f, 0.103f, 0.041f, 0.0068f)]
        [TestCase(60f, 0.532f, 0.293f, 0.116f, 0.051f, 0.0088f)]
        [TestCase(100f, 0.496f, 0.301f, 0.130f, 0.062f, 0.0112f)]
        [TestCase(250f, 0.440f, 0.313f, 0.153f, 0.080f, 0.0148f)]
        [TestCase(400f, 0.440f, 0.313f, 0.153f, 0.080f, 0.0148f)]
        public void Shares_MatchTheGddLuckTable(float bonus, float common, float uncommon, float rare, float epic, float legendary)
        {
            float[] shares = Shares(10, 0, bonus, 0, 1f);

            Assert.That(shares[0], Is.EqualTo(common).Within(0.0006f));
            Assert.That(shares[1], Is.EqualTo(uncommon).Within(0.0006f));
            Assert.That(shares[2], Is.EqualTo(rare).Within(0.0006f));
            Assert.That(shares[3], Is.EqualTo(epic).Within(0.0006f));
            Assert.That(shares[4], Is.EqualTo(legendary).Within(0.00006f));
        }

        [Test]
        public void Bonus_AddsLuckLootQualityDifficultyWorldTierAndEvent()
        {
            Assert.That(LuckFormula.Bonus(0f, 1, 0f, 0, 0f), Is.EqualTo(15f));
            Assert.That(LuckFormula.Bonus(20f, 4, 0f, 0, 0f), Is.EqualTo(80f));
            Assert.That(LuckFormula.Bonus(60f, 5, 0f, 5, 0f), Is.EqualTo(185f));
            Assert.That(LuckFormula.Bonus(30f, 6, 10f, 10, 10f), Is.EqualTo(240f));
        }

        [TestCase(50f, 50f)]
        [TestCase(100f, 100f)]
        [TestCase(185f, 142.5f)]
        [TestCase(220f, 160f)]
        [TestCase(250f, 175f)]
        [TestCase(1000f, 175f)]
        [TestCase(-5f, 0f)]
        public void Effective_HalvesAbove100_AndCapsAt175(float bonus, float expected)
        {
            Assert.That(LuckFormula.Effective(bonus), Is.EqualTo(expected).Within(1e-4f));
        }

        [Test]
        public void ChampionAtNight_MatchesTheGddExample()
        {
            // LQ 3 + 1 at night, luck 20: B = 80. Rare (incl. lift) 93.4 %, epic 5.7 %, legendary 1.0 %.
            float[] shares = Shares(30, 4, LuckFormula.Bonus(20f, 4, 0f, 0, 0f), 0, 1f);

            Assert.That(shares[0] + shares[1] + shares[2], Is.EqualTo(0.934f).Within(0.001f));
            Assert.That(shares[3], Is.EqualTo(0.057f).Within(0.001f));
            Assert.That(shares[4], Is.EqualTo(0.010f).Within(0.0005f));
        }

        [Test]
        public void RiftChestAndRaidBoss_MatchTheGddExamples()
        {
            float[] rift = Shares(60, 5, LuckFormula.Bonus(60f, 5, 0f, 5, 0f), 5, 1f);
            Assert.That(rift[4], Is.EqualTo(0.033f).Within(0.001f), "rift chest level 10: legendary 3.3 %");

            float[] raid = Shares(80, 6, LuckFormula.Bonus(30f, 6, 0f, 10, 0f), 10, 1f);
            Assert.That(raid[4], Is.EqualTo(0.103f).Within(0.001f), "raid boss: legendary 10.3 %");
        }

        [Test]
        public void Pity_MatchesTheGddExampleAtB30()
        {
            Assert.That(Shares(10, 0, 30f, 0, 1f)[4], Is.EqualTo(0.0068f).Within(0.00006f));
            Assert.That(Shares(10, 0, 30f, 0, 2f)[4], Is.EqualTo(0.0134f).Within(0.0001f));
            Assert.That(Shares(10, 0, 30f, 0, 3f)[4], Is.EqualTo(0.0200f).Within(0.0001f));
            Assert.That(Shares(10, 0, 30f, 0, 5f)[4], Is.EqualTo(0.0329f).Within(0.0001f));
            Assert.That(Shares(10, 0, 30f, 0, 6.96f)[4], Is.EqualTo(0.0452f).Within(0.0001f));
        }

        [Test]
        public void MinimumItemLevels_RemoveRareEpicAndLegendaryBelowThem()
        {
            Assert.That(RarityRoller.Weight(ItemRarity.Rare, 2, 0, 0f, 0, 1f), Is.EqualTo(0f));
            Assert.That(RarityRoller.Weight(ItemRarity.Rare, 3, 0, 0f, 0, 1f), Is.EqualTo(900f));
            Assert.That(RarityRoller.Weight(ItemRarity.Epic, 9, 0, 0f, 0, 1f), Is.EqualTo(0f));
            Assert.That(RarityRoller.Weight(ItemRarity.Legendary, 9, 0, 0f, 0, 1f), Is.EqualTo(0f));
            Assert.That(RarityRoller.Weight(ItemRarity.Legendary, 10, 6, 0f, 0, 1f), Is.EqualTo(90f), "LQ 6 doubles the legendary weight");
        }

        [Test]
        public void MinimumRarity_LiftsInsteadOfRemoving()
        {
            Assert.That(LootQualityRules.MinimumRarity(2), Is.EqualTo(ItemRarity.Common));
            Assert.That(LootQualityRules.MinimumRarity(3), Is.EqualTo(ItemRarity.Rare));
            Assert.That(LootQualityRules.MinimumRarity(5), Is.EqualTo(ItemRarity.Epic));

            // A roll of 0.0 picks Common; at LQ 3 it is lifted to Rare, at LQ 5 to Epic.
            Assert.That(RarityRoller.Roll(20, 3, 45f, 0, null, new SequenceRandom(0f)), Is.EqualTo(ItemRarity.Rare));
            Assert.That(RarityRoller.Roll(20, 5, 75f, 0, null, new SequenceRandom(0f)), Is.EqualTo(ItemRarity.Epic));

            // A roll at the very end picks Legendary and stays Legendary.
            Assert.That(RarityRoller.Roll(20, 3, 45f, 0, null, new SequenceRandom(0.99999f)), Is.EqualTo(ItemRarity.Legendary));
        }

        [Test]
        public void Mythic_OnlyFromWorldTier1AndItemLevel60_WithTheShareOfTheTable()
        {
            Assert.That(RarityRoller.MythicShare(0), Is.EqualTo(0f));
            Assert.That(RarityRoller.MythicShare(1), Is.EqualTo(0.01f));
            Assert.That(RarityRoller.MythicShare(5), Is.EqualTo(0.07f));
            Assert.That(RarityRoller.MythicShare(10), Is.EqualTo(0.22f));

            // Legendary (roll 0.99999) and the mythic check (0.0 < share) → mythic, but only at world tier ≥ 1 and iLvl ≥ 60.
            Assert.That(RarityRoller.Roll(60, 0, 0f, 1, null, new SequenceRandom(0.99999f, 0f)), Is.EqualTo(ItemRarity.Mythic));
            Assert.That(RarityRoller.Roll(59, 0, 0f, 1, null, new SequenceRandom(0.99999f, 0f)), Is.EqualTo(ItemRarity.Legendary));
            Assert.That(RarityRoller.Roll(80, 0, 0f, 0, null, new SequenceRandom(0.99999f, 0f)), Is.EqualTo(ItemRarity.Legendary));
        }

        [Test]
        public void Roll_DistributionAtB15_MatchesTheGddTable_On100000Rolls()
        {
            // Normal enemy (LQ 1), luck 0: B = 15 → 58.0 / 28.3 / 9.7 / 3.6 / 0.57 %.
            var random = new Pcg32Random(0x5eedUL);
            var counts = new int[RarityRules.Count];
            const int rolls = 100000;
            for (int i = 0; i < rolls; i++)
            {
                counts[(int)RarityRoller.Roll(10, 1, LuckFormula.Bonus(0f, 1, 0f, 0, 0f), 0, null, random)]++;
            }

            // Tolerances of about 4 standard deviations at 100,000 rolls (sqrt(p(1 - p) / n)), so the rare rows are checked too:
            // a fixed tolerance of 1 percentage point would pass even if legendary never dropped.
            Assert.That(counts[0] / (float)rolls, Is.EqualTo(0.580f).Within(0.006f), "common");
            Assert.That(counts[1] / (float)rolls, Is.EqualTo(0.283f).Within(0.006f), "uncommon");
            Assert.That(counts[2] / (float)rolls, Is.EqualTo(0.097f).Within(0.004f), "rare");
            Assert.That(counts[3] / (float)rolls, Is.EqualTo(0.036f).Within(0.0025f), "epic");
            Assert.That(counts[4] / (float)rolls, Is.EqualTo(0.0057f).Within(0.001f), "legendary");
            Assert.That(counts[5] + counts[6], Is.EqualTo(0));
        }
    }
}
