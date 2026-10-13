using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Statistical check of the weighted roll (GDD 04 5.1): 100,000 rolls of the GDD example table
    /// <c>loot.enemy.bandit.schlaeger</c> (nothing 400, gold 300, consumables table 150, junk table 100, equipment 80) with a
    /// fixed seed hit the shares 38.8 / 29.1 / 14.6 / 9.7 / 7.8 % within ±1 percentage point; the nested table distributes
    /// its own weights the same way.
    /// </summary>
    [TestFixture]
    public sealed class LootStatisticsTests
    {
        private const int Rolls = 100000;
        private const float Tolerance = 0.01f;

        private LogCapture _log;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        [Test]
        public void BanditTable_100000Rolls_HitTheWeights()
        {
            ItemCatalog catalog = ItemTestCatalog.Create();
            LootEntrySpec gold = ItemTestCatalog.Entry(LootEntryKind.Gold, 300);
            gold.GoldFactorMin = 0.02f;
            gold.GoldFactorMax = 0.05f;
            Assert.That(catalog.AddLootTable(ItemTestCatalog.Table("loot.enemy.bandit.schlaeger", 1, 1,
                ItemTestCatalog.Entry(LootEntryKind.Nothing, 400),
                gold,
                ItemTestCatalog.Entry(LootEntryKind.Table, 150, "loot.shared.verbrauch_eichental"),
                ItemTestCatalog.Entry(LootEntryKind.Table, 100, "loot.shared.plunder"),
                ItemTestCatalog.Entry(LootEntryKind.Equipment, 80))), Is.Empty);
            Assert.That(catalog.AddLootTable(ItemTestCatalog.Table("loot.shared.verbrauch_eichental", 1, 1,
                ItemTestCatalog.Entry(LootEntryKind.Item, 3, ItemTestCatalog.Potion),
                ItemTestCatalog.Entry(LootEntryKind.Item, 1, ItemTestCatalog.WolfFur))), Is.Empty);
            Assert.That(catalog.AddLootTable(ItemTestCatalog.Table("loot.shared.plunder", 1, 1,
                ItemTestCatalog.Entry(LootEntryKind.Currency, 100, "currency.test.plunder"))), Is.Empty);
            var roller = new LootRoller(catalog);
            var random = new Pcg32Random(0xA37F5EEDUL);
            var context = new LootContext("enemy.bandit.schlaeger", 10, 1, 0f);

            int nothing = 0;
            int goldDrops = 0;
            int consumables = 0;
            int potions = 0;
            int junk = 0;
            int equipment = 0;
            for (int i = 0; i < Rolls; i++)
            {
                LootResult result = roller.Roll("loot.enemy.bandit.schlaeger", context, null, random);
                Assert.That(result.Drops.Count, Is.LessThanOrEqualTo(1));
                if (result.Drops.Count == 0)
                {
                    nothing++;
                    continue;
                }

                LootDrop drop = result.Drops[0];
                if (drop.IsCurrency)
                {
                    if (drop.CurrencyId == CurrencyIds.Gold)
                    {
                        goldDrops++;
                    }
                    else
                    {
                        junk++;
                    }

                    continue;
                }

                if (drop.Item.ItemId == ItemTestCatalog.Potion || drop.Item.ItemId == ItemTestCatalog.WolfFur)
                {
                    consumables++;
                    if (drop.Item.ItemId == ItemTestCatalog.Potion)
                    {
                        potions++;
                    }
                }
                else
                {
                    equipment++;
                }
            }

            Assert.That(nothing / (float)Rolls, Is.EqualTo(400f / 1030f).Within(Tolerance), "nothing 38.8 %");
            Assert.That(goldDrops / (float)Rolls, Is.EqualTo(300f / 1030f).Within(Tolerance), "gold 29.1 %");
            Assert.That(consumables / (float)Rolls, Is.EqualTo(150f / 1030f).Within(Tolerance), "consumables 14.6 %");
            Assert.That(junk / (float)Rolls, Is.EqualTo(100f / 1030f).Within(Tolerance), "junk 9.7 %");
            Assert.That(equipment / (float)Rolls, Is.EqualTo(80f / 1030f).Within(Tolerance), "equipment 7.8 %");
            Assert.That(potions / (float)consumables, Is.EqualTo(0.75f).Within(0.02f), "nested table: potion 3 of 4 (about 14,600 samples)");
        }

        [Test]
        public void SameSeed_GivesTheSameSequence()
        {
            ItemCatalog catalog = ItemTestCatalog.Create();
            Assert.That(catalog.AddLootTable(ItemTestCatalog.Table("loot.test.mix", 1, 2,
                ItemTestCatalog.Entry(LootEntryKind.Nothing, 100),
                ItemTestCatalog.Entry(LootEntryKind.Equipment, 100),
                ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.WolfFur))), Is.Empty);
            var roller = new LootRoller(catalog);
            var a = new Pcg32Random(31337UL);
            var b = new Pcg32Random(31337UL);
            var context = new LootContext("x", 10, 1, 0f);

            for (int i = 0; i < 1000; i++)
            {
                LootResult first = roller.Roll("loot.test.mix", context, null, a);
                LootResult second = roller.Roll("loot.test.mix", context, null, b);
                Assert.That(second.Drops.Count, Is.EqualTo(first.Drops.Count));
                for (int d = 0; d < first.Drops.Count; d++)
                {
                    Assert.That(second.Drops[d].ToString(), Is.EqualTo(first.Drops[d].ToString()));
                }
            }
        }
    }
}
