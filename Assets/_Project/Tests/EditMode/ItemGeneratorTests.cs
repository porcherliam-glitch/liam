using System.Collections.Generic;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="ItemGenerator"/> and <see cref="ItemInstance"/>: affix count by rarity (GDD 04 3.1), mythic affixes on the
    /// highest tier, instance ids, flags (new, legendary locked automatically), determinism with the same seed, and the stat
    /// modifiers of an item with the source id <c>item:&lt;instanceId&gt;</c>.
    /// </summary>
    [TestFixture]
    public sealed class ItemGeneratorTests
    {
        private ItemCatalog _catalog;
        private ItemGenerator _generator;

        [SetUp]
        public void SetUp()
        {
            _catalog = ItemTestCatalog.Create();
            _generator = new ItemGenerator(_catalog.Affixes);
        }

        private ItemSpec Spec(string id)
        {
            Assert.That(_catalog.TryGetItem(id, out ItemSpec spec), Is.True, id);
            return spec;
        }

        [TestCase(ItemRarity.Common, 0)]
        [TestCase(ItemRarity.Uncommon, 1)]
        [TestCase(ItemRarity.Rare, 2)]
        [TestCase(ItemRarity.Epic, 3)]
        [TestCase(ItemRarity.Legendary, 3)]
        [TestCase(ItemRarity.Mythic, 4)]
        public void AffixCount_FollowsTheRarity(ItemRarity rarity, int expected)
        {
            var random = new Pcg32Random(11UL);
            for (int i = 0; i < 50; i++)
            {
                ItemInstance item = _generator.Generate(Spec(ItemTestCatalog.PlateChest), 80, rarity, random);
                Assert.That(item.Affixes.Count, Is.EqualTo(expected));
            }
        }

        [Test]
        public void Mythic_RollsEveryAffixOnTheHighestTier_InTheUpperHalf()
        {
            var random = new Pcg32Random(12UL);
            ItemInstance item = _generator.Generate(Spec(ItemTestCatalog.PlateChest), 80, ItemRarity.Mythic, random);

            for (int i = 0; i < item.Affixes.Count; i++)
            {
                AffixRoll roll = item.Affixes[i];
                _catalog.Affixes.TryGet(roll.AffixId, out AffixSpec affix);
                affix.RangeForTier(6, out float min, out float max);
                Assert.That(roll.Tier, Is.EqualTo(6));
                Assert.That(roll.Value, Is.GreaterThanOrEqualTo(min + (max - min) * 0.5f - 0.5f));
                Assert.That(roll.Value, Is.LessThanOrEqualTo(max));
            }
        }

        [Test]
        public void Generate_SetsIdLevelSpreadAndFlags()
        {
            var random = new Pcg32Random(13UL);
            ItemInstance rare = _generator.Generate(Spec(ItemTestCatalog.Sword), 10, ItemRarity.Rare, random);
            ItemInstance legendary = _generator.Generate(Spec(ItemTestCatalog.Sword), 10, ItemRarity.Legendary, random);

            Assert.That(ItemInstanceIds.IsValid(rare.InstanceId), Is.True, rare.InstanceId);
            Assert.That(rare.InstanceId, Is.Not.EqualTo(legendary.InstanceId));
            Assert.That(rare.ItemId, Is.EqualTo(ItemTestCatalog.Sword));
            Assert.That(rare.ItemLevel, Is.EqualTo(10));
            Assert.That(rare.BaseRoll, Is.InRange(0.95f, 1.05f));
            Assert.That(rare.Count, Is.EqualTo(1));
            Assert.That(rare.IsNew, Is.True);
            Assert.That(rare.IsLocked, Is.False);
            Assert.That(legendary.IsLocked, Is.True, "legendary items are locked automatically");
        }

        [Test]
        public void Generate_IsDeterministicForTheSameSeed()
        {
            ItemInstance a = _generator.Generate(Spec(ItemTestCatalog.PlateChest), 40, ItemRarity.Epic, new Pcg32Random(99UL));
            ItemInstance b = _generator.Generate(Spec(ItemTestCatalog.PlateChest), 40, ItemRarity.Epic, new Pcg32Random(99UL));

            Assert.That(b.InstanceId, Is.EqualTo(a.InstanceId));
            Assert.That(b.BaseRoll, Is.EqualTo(a.BaseRoll));
            Assert.That(b.Affixes.Count, Is.EqualTo(a.Affixes.Count));
            for (int i = 0; i < a.Affixes.Count; i++)
            {
                Assert.That(b.Affixes[i].AffixId, Is.EqualTo(a.Affixes[i].AffixId));
                Assert.That(b.Affixes[i].Tier, Is.EqualTo(a.Affixes[i].Tier));
                Assert.That(b.Affixes[i].Value, Is.EqualTo(a.Affixes[i].Value));
            }
        }

        [Test]
        public void CreateFixed_KeepsTheCountAndHasNoAffixes()
        {
            ItemInstance potions = _generator.CreateFixed(Spec(ItemTestCatalog.Potion), 1, ItemRarity.Common, 3, new Pcg32Random(1UL));

            Assert.That(potions.Count, Is.EqualTo(3));
            Assert.That(potions.Affixes.Count, Is.EqualTo(0));
            Assert.That(potions.BaseRoll, Is.EqualTo(1f));
            Assert.That(potions.IsNew, Is.True);
        }

        [Test]
        public void CollectModifiers_ArmorImplicitAndAffixes_UseTheItemSource()
        {
            var affixes = new List<AffixRoll> { new AffixRoll(ItemTestCatalog.Vital, 2, 40f), new AffixRoll(ItemTestCatalog.FireWard, 2, 7f) };
            var chest = new ItemInstance("00000000000000aa", ItemTestCatalog.PlateChest, 10, ItemRarity.Rare, 1f, 1, ItemFlags.None, affixes);
            var ring = new ItemInstance("00000000000000bb", ItemTestCatalog.IronRing, 80, ItemRarity.Common, 1f, 1, ItemFlags.None, null);
            _catalog.Affixes.TryGet(ItemTestCatalog.FireWard, out AffixSpec fire);
            fire.ValueScale = 0.01f;
            var result = new List<StatModifier>();

            ItemStats.CollectModifiers(Spec(ItemTestCatalog.PlateChest), chest, _catalog.Affixes, StatSourceIds.Item(chest.InstanceId), result);
            ItemStats.CollectModifiers(Spec(ItemTestCatalog.IronRing), ring, _catalog.Affixes, StatSourceIds.Item(ring.InstanceId), result);

            Assert.That(result.Count, Is.EqualTo(4));
            Assert.That(result[0].Stat, Is.EqualTo(StatId.Armor));
            Assert.That(result[0].Value, Is.EqualTo(22f), "9 × 2.08 × 1.2 = 22.46 → 22");
            Assert.That(result[0].SourceId, Is.EqualTo("item:00000000000000aa"));
            Assert.That(result[1].Stat, Is.EqualTo(StatId.MaxHealth));
            Assert.That(result[1].Value, Is.EqualTo(40f));
            Assert.That(result[2].Stat, Is.EqualTo(StatId.ResistFire));
            Assert.That(result[2].Value, Is.EqualTo(0.07f).Within(1e-6f));
            Assert.That(result[3].Stat, Is.EqualTo(StatId.Armor));
            Assert.That(result[3].Value, Is.EqualTo(30f), "iron ring implicit at item level 80");
            Assert.That(result[3].SourceId, Is.EqualTo("item:00000000000000bb"));
        }

        [Test]
        public void Instance_RejectsMissingIds_AndKeepsStacksPositive()
        {
            Assert.Throws<System.ArgumentException>(() => new ItemInstance(string.Empty, "item.x.y", 1, ItemRarity.Common, 1f, 1, ItemFlags.None, null));
            Assert.Throws<System.ArgumentException>(() => new ItemInstance("0000000000000001", null, 1, ItemRarity.Common, 1f, 1, ItemFlags.None, null));
            var item = new ItemInstance("0000000000000001", "item.x.y", 1, ItemRarity.Common, 1f, 5, ItemFlags.New, null);

            Assert.Throws<System.ArgumentOutOfRangeException>(() => item.SetCount(0));
            item.SetFlags(ItemFlags.Favorite, true);
            item.SetFlags(ItemFlags.New, false);
            Assert.That(item.IsFavorite, Is.True);
            Assert.That(item.IsNew, Is.False);
            Assert.That(ItemInstanceIds.IsValid("00000000000000AA"), Is.False, "lower-case hex only");
            Assert.That(ItemInstanceIds.IsValid("0123456789abcdef"), Is.True);
        }
    }
}
