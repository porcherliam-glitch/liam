using Aetherfall.Core;
using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="LootRoller"/> (GDD 04 5.1/5.4): guaranteed entries on top of the rolls, roll count, single items with a
    /// count above 1 as separate drops, "nothing" entries,
    /// nested tables up to depth 4, level conditions, gold as a multiple of G(L), loot quality override and item level of
    /// the equipment, extra rolls (elite), determinism with the same seed, and the reference checks of the catalog.
    /// </summary>
    [TestFixture]
    public sealed class LootRollerTests
    {
        private LogCapture _log;
        private ItemCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _catalog = ItemTestCatalog.Create();
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        private LootRoller Roller()
        {
            return new LootRoller(_catalog);
        }

        private void AddTable(LootTableSpec table)
        {
            Assert.That(_catalog.AddLootTable(table), Is.Empty, table.Id);
        }

        private static LootEntrySpec Guaranteed(LootEntrySpec entry)
        {
            entry.Flags |= LootEntryFlags.Guaranteed;
            entry.Weight = 0;
            return entry;
        }

        [Test]
        public void GuaranteedEntries_AlwaysDrop_InAdditionToTheRolls()
        {
            AddTable(ItemTestCatalog.Table("loot.test.wolf", 2, 2,
                Guaranteed(ItemTestCatalog.Entry(LootEntryKind.Item, 0, ItemTestCatalog.WolfFur)),
                ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.Potion)));
            LootRoller roller = Roller();

            LootResult result = roller.Roll("loot.test.wolf", new LootContext("enemy.wolf#1", 8, 1, 0f), null, new Pcg32Random(1UL));

            Assert.That(result.Drops.Count, Is.EqualTo(3));
            Assert.That(result.Drops[0].Item.ItemId, Is.EqualTo(ItemTestCatalog.WolfFur));
            Assert.That(result.Drops[1].Item.ItemId, Is.EqualTo(ItemTestCatalog.Potion));
            Assert.That(result.Drops[2].Item.ItemId, Is.EqualTo(ItemTestCatalog.Potion));
            Assert.That(result.Drops[0].Item.ItemLevel, Is.EqualTo(8));
            Assert.That(result.HasItems, Is.True);
            Assert.That(result.TableId, Is.EqualTo("loot.test.wolf"));
            Assert.That(result.SourceId, Is.EqualTo("enemy.wolf#1"));
        }

        [Test]
        public void ItemEntry_SingleItemsTimesTwo_GivesTwoDrops_StackablesOneStack()
        {
            AddTable(ItemTestCatalog.Table("loot.test.schwerter", 0, 0,
                Guaranteed(ItemTestCatalog.Entry(LootEntryKind.Item, 0, ItemTestCatalog.Sword, 2, 2)),
                Guaranteed(ItemTestCatalog.Entry(LootEntryKind.Item, 0, ItemTestCatalog.Potion, 3, 3))));

            LootResult result = Roller().Roll("loot.test.schwerter", new LootContext("x", 10, 1, 0f), null, new Pcg32Random(4UL));

            Assert.That(result.Drops.Count, Is.EqualTo(3));
            Assert.That(result.Drops[0].Item.ItemId, Is.EqualTo(ItemTestCatalog.Sword));
            Assert.That(result.Drops[0].Item.Count, Is.EqualTo(1));
            Assert.That(result.Drops[1].Item.ItemId, Is.EqualTo(ItemTestCatalog.Sword));
            Assert.That(result.Drops[1].Item.Count, Is.EqualTo(1));
            Assert.That(result.Drops[1].Item.InstanceId, Is.Not.EqualTo(result.Drops[0].Item.InstanceId));
            Assert.That(result.Drops[2].Item.ItemId, Is.EqualTo(ItemTestCatalog.Potion));
            Assert.That(result.Drops[2].Item.Count, Is.EqualTo(3));
        }

        [Test]
        public void NothingEntry_GivesAnEmptyResult()
        {
            AddTable(ItemTestCatalog.Table("loot.test.leer", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Nothing, 100)));

            LootResult result = Roller().Roll("loot.test.leer", new LootContext("x", 5, 1, 0f), null, new Pcg32Random(2UL));

            Assert.That(result.Drops.Count, Is.EqualTo(0));
            Assert.That(result.HasItems, Is.False);
            Assert.That(result.BestRarity, Is.EqualTo(ItemRarity.Common));
        }

        [Test]
        public void Gold_IsAMultipleOfGL()
        {
            var gold = ItemTestCatalog.Entry(LootEntryKind.Gold, 100);
            gold.GoldFactorMin = 5f;
            gold.GoldFactorMax = 5f;
            AddTable(ItemTestCatalog.Table("loot.test.gold", 1, 1, gold));

            LootResult result = Roller().Roll("loot.test.gold", new LootContext("obj.test.ole", 11, 5, 0f), null, new Pcg32Random(3UL));

            Assert.That(result.CurrencyTotal(CurrencyIds.Gold), Is.EqualTo(405), "GDD 04 5.6: Oles chest 5 × G(11) = 405");
            Assert.That(result.HasItems, Is.False);
        }

        [Test]
        public void Gold_RangeStaysInsideTheFactors()
        {
            var gold = ItemTestCatalog.Entry(LootEntryKind.Gold, 100);
            gold.GoldFactorMin = 0.02f;
            gold.GoldFactorMax = 0.05f;
            AddTable(ItemTestCatalog.Table("loot.test.gold", 1, 1, gold));
            LootRoller roller = Roller();
            var random = new Pcg32Random(4UL);
            for (int i = 0; i < 200; i++)
            {
                int amount = roller.Roll("loot.test.gold", new LootContext("x", 30, 1, 0f), null, random).CurrencyTotal(CurrencyIds.Gold);
                Assert.That(amount, Is.InRange(4, 10), "0.02–0.05 × G(30) = 3.9–9.75");
            }
        }

        [Test]
        public void NestedTables_AreRolled_ButNotDeeperThan4()
        {
            for (int level = 0; level <= 5; level++)
            {
                LootEntrySpec entry = level < 5
                    ? ItemTestCatalog.Entry(LootEntryKind.Table, 100, "loot.test.ebene" + (level + 1))
                    : ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.Potion);
                AddTable(ItemTestCatalog.Table("loot.test.ebene" + level, 1, 1, entry));
            }

            LootRoller roller = Roller();
            LootResult deep = roller.Roll("loot.test.ebene0", new LootContext("x", 5, 1, 0f), null, new Pcg32Random(5UL));
            LootResult four = roller.Roll("loot.test.ebene1", new LootContext("x", 5, 1, 0f), null, new Pcg32Random(5UL));

            Assert.That(deep.Drops.Count, Is.EqualTo(0), "depth 5 is cut off");
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "nests deeper"), Is.True);
            Assert.That(four.Drops.Count, Is.EqualTo(1), "depth 4 is allowed");
            Assert.That(four.Drops[0].Item.ItemId, Is.EqualTo(ItemTestCatalog.Potion));
        }

        [Test]
        public void LevelConditions_RemoveEntriesFromTheRoll()
        {
            LootEntrySpec potion = ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.Potion);
            potion.MinSourceLevel = 10;
            LootEntrySpec fur = ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.WolfFur);
            fur.MaxSourceLevel = 9;
            AddTable(ItemTestCatalog.Table("loot.test.bedingung", 1, 1, potion, fur));
            LootRoller roller = Roller();
            var random = new Pcg32Random(6UL);

            for (int i = 0; i < 50; i++)
            {
                Assert.That(roller.Roll("loot.test.bedingung", new LootContext("x", 5, 1, 0f), null, random).Drops[0].Item.ItemId,
                    Is.EqualTo(ItemTestCatalog.WolfFur));
                Assert.That(roller.Roll("loot.test.bedingung", new LootContext("x", 12, 1, 0f), null, random).Drops[0].Item.ItemId,
                    Is.EqualTo(ItemTestCatalog.Potion));
            }
        }

        [Test]
        public void Equipment_UsesTheSourceLevel_AndTheLootQualityOverride()
        {
            LootTableSpec table = ItemTestCatalog.Table("loot.test.versteckt", 0, 0,
                Guaranteed(ItemTestCatalog.Entry(LootEntryKind.Equipment, 0)), Guaranteed(ItemTestCatalog.Entry(LootEntryKind.Equipment, 0)));
            table.LootQualityOverride = 3;
            AddTable(table);
            LootRoller roller = Roller();
            var random = new Pcg32Random(7UL);

            for (int i = 0; i < 100; i++)
            {
                LootResult result = roller.Roll("loot.test.versteckt", new LootContext("obj.test.truhe", 10, 0, 0f, 1), null, random);
                Assert.That(result.Drops.Count, Is.EqualTo(2));
                for (int d = 0; d < result.Drops.Count; d++)
                {
                    ItemInstance item = result.Drops[d].Item;
                    Assert.That(item.ItemLevel, Is.EqualTo(11), "area level 10 + delta 1");
                    Assert.That(RarityRules.Rank(item.Rarity), Is.GreaterThanOrEqualTo(RarityRules.Rank(ItemRarity.Rare)), "LQ 3: at least rare");
                    _catalog.TryGetItem(item.ItemId, out ItemSpec spec);
                    Assert.That(spec.IsEquipment, Is.True);
                    Assert.That(item.Affixes.Count, Is.LessThanOrEqualTo(RarityRules.AffixCount(item.Rarity)));
                }
            }
        }

        [Test]
        public void EquipmentGroupShares_PickTheGroup()
        {
            LootEntrySpec weaponsOnly = ItemTestCatalog.Entry(LootEntryKind.Equipment, 100);
            weaponsOnly.WeaponShare = 1;
            weaponsOnly.ArmorShare = 0;
            weaponsOnly.JewelryShare = 0;
            AddTable(ItemTestCatalog.Table("loot.test.waffen", 1, 1, weaponsOnly));
            LootRoller roller = Roller();
            var random = new Pcg32Random(8UL);

            for (int i = 0; i < 100; i++)
            {
                ItemInstance item = roller.Roll("loot.test.waffen", new LootContext("x", 10, 1, 0f), null, random).Drops[0].Item;
                _catalog.TryGetItem(item.ItemId, out ItemSpec spec);
                Assert.That(spec.Group, Is.EqualTo(EquipmentGroup.Weapon));
            }
        }

        [Test]
        public void ExtraRolls_AddRollsAtTheTopLevel()
        {
            AddTable(ItemTestCatalog.Table("loot.test.elite", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.Potion)));

            LootResult result = Roller().Roll("loot.test.elite", new LootContext("x", 10, 2, 0f, 0, 0, 0f, 0f, 1), null, new Pcg32Random(9UL));

            Assert.That(result.Drops.Count, Is.EqualTo(2));
        }

        [Test]
        public void SameSeed_GivesTheSameLoot()
        {
            AddTable(ItemTestCatalog.Table("loot.test.mix", 2, 3, ItemTestCatalog.Entry(LootEntryKind.Equipment, 100),
                ItemTestCatalog.Entry(LootEntryKind.Item, 100, ItemTestCatalog.WolfFur, 1, 3), ItemTestCatalog.Entry(LootEntryKind.Nothing, 50)));
            LootRoller roller = Roller();
            var context = new LootContext("obj.test.truhe_holz", 10, 1, 0f);

            LootResult a = roller.Roll("loot.test.mix", context, new PityState(), new Pcg32Random(123UL));
            LootResult b = roller.Roll("loot.test.mix", context, new PityState(), new Pcg32Random(123UL));

            Assert.That(b.Drops.Count, Is.EqualTo(a.Drops.Count));
            for (int i = 0; i < a.Drops.Count; i++)
            {
                Assert.That(b.Drops[i].ToString(), Is.EqualTo(a.Drops[i].ToString()));
            }
        }

        [Test]
        public void UnknownTable_LogsAWarning_AndGivesNothing()
        {
            LootResult result = Roller().Roll("loot.test.fehlt", new LootContext("x", 1, 1, 0f), null, new Pcg32Random(10UL));

            Assert.That(result.Drops.Count, Is.EqualTo(0));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "loot.test.fehlt"), Is.True);
        }

        [Test]
        public void Catalog_ReportsUnknownReferencesAndCycles()
        {
            AddTable(ItemTestCatalog.Table("loot.test.a", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Table, 100, "loot.test.b")));
            AddTable(ItemTestCatalog.Table("loot.test.b", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Table, 100, "loot.test.a")));
            AddTable(ItemTestCatalog.Table("loot.test.c", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Item, 100, "item.test.unbekannt")));
            var problems = new System.Collections.Generic.List<string>();

            _catalog.ValidateReferences(problems);

            Assert.That(problems.Count, Is.EqualTo(3), string.Join("\n", problems));
            Assert.That(_catalog.AddLootTable(ItemTestCatalog.Table("loot.test.a", 1, 1, ItemTestCatalog.Entry(LootEntryKind.Nothing, 1))),
                Does.Contain("Duplicate"));
            Assert.That(_catalog.AddLootTable(ItemTestCatalog.Table("loot.test.leer", 1, 1)), Does.Contain("no entries"));
            Assert.That(_catalog.AddItem(ItemTestCatalog.Simple("item.test.kaputt", ItemCategory.Weapon, EquipKind.OneHanded, 5, 1f, 1f)),
                Does.Contain("stackable"));
        }
    }
}
