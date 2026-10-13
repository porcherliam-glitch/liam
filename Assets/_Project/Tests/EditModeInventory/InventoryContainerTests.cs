using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// <see cref="InventoryContainer"/> (GDD 04 2.1/2.2): stacking up to the stack size, new stacks with own ids, one entry per
    /// equipment piece, the limit of 1000 entries, weight, taking and removing (smallest stacks first), and the sorting and
    /// filtering of <see cref="InventorySorting"/>.
    /// </summary>
    [TestFixture]
    public sealed class InventoryContainerTests
    {
        private ItemCatalog _catalog;
        private Pcg32Random _random;
        private InventoryContainer _bag;

        [SetUp]
        public void SetUp()
        {
            _catalog = InventoryTestItems.CreateCatalog();
            _random = new Pcg32Random(5UL);
            _bag = new InventoryContainer(InventoryOwners.Player, _catalog, _random);
        }

        private ItemInstance Create(string itemId, int count = 1, ItemRarity rarity = ItemRarity.Common, int itemLevel = 1)
        {
            _catalog.TryGetItem(itemId, out ItemSpec spec);
            return new ItemGenerator(_catalog.Affixes).CreateFixed(spec, itemLevel, rarity, count, _random);
        }

        [Test]
        public void Stackables_FillExistingStacksFirst_ThenOpenNewOnes()
        {
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.WolfFur, 60)), Is.True);
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.WolfFur, 90)), Is.True);

            Assert.That(_bag.Entries.Count, Is.EqualTo(2));
            Assert.That(_bag.Entries[0].Count, Is.EqualTo(99));
            Assert.That(_bag.Entries[1].Count, Is.EqualTo(51));
            Assert.That(_bag.CountOf(InventoryTestItems.WolfFur), Is.EqualTo(150));
            Assert.That(_bag.TotalWeight, Is.EqualTo(150f).Within(1e-3f));
        }

        [Test]
        public void LargeStack_IsSplitIntoStacksWithOwnIds()
        {
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.Potion, 45)), Is.True);

            Assert.That(_bag.Entries.Count, Is.EqualTo(3));
            Assert.That(_bag.Entries[0].Count + _bag.Entries[1].Count + _bag.Entries[2].Count, Is.EqualTo(45));
            Assert.That(_bag.Entries[0].InstanceId, Is.Not.EqualTo(_bag.Entries[1].InstanceId));
            Assert.That(ItemInstanceIds.IsValid(_bag.Entries[2].InstanceId), Is.True);
        }

        [Test]
        public void Equipment_TakesOneEntryEach_AndUnknownItemsAreRefused()
        {
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.Sword)), Is.True);
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.Sword)), Is.True);
            ItemInstance duplicate = _bag.Entries[0];

            Assert.That(_bag.TryAdd(duplicate), Is.False, "the same instance twice");
            Assert.That(_bag.TryAdd(new ItemInstance("00000000000000ff", "item.test.unbekannt", 1, ItemRarity.Common, 1f, 1, ItemFlags.None, null)),
                Is.False);
            Assert.That(_bag.Entries.Count, Is.EqualTo(2));
        }

        [Test]
        public void ThousandEntries_AreTheLimit()
        {
            for (int i = 0; i < InventoryContainer.MaxEntries; i++)
            {
                Assert.That(_bag.TryAdd(Create(InventoryTestItems.IronRing)), Is.True);
            }

            Assert.That(_bag.TryAdd(Create(InventoryTestItems.IronRing)), Is.False);
            Assert.That(_bag.TryAdd(Create(InventoryTestItems.WolfFur)), Is.False, "a new stack would need entry 1001");
            Assert.That(_bag.Entries.Count, Is.EqualTo(InventoryContainer.MaxEntries));
        }

        [Test]
        public void RemoveItem_TakesSmallestStacksFirst()
        {
            _bag.TryAdd(Create(InventoryTestItems.WolfFur, 99));
            _bag.TryAdd(Create(InventoryTestItems.WolfFur, 20));

            Assert.That(_bag.RemoveItem(InventoryTestItems.WolfFur, 30), Is.EqualTo(30));
            Assert.That(_bag.Entries.Count, Is.EqualTo(1));
            Assert.That(_bag.Entries[0].Count, Is.EqualTo(89));
            Assert.That(_bag.RemoveItem(InventoryTestItems.WolfFur, 500), Is.EqualTo(89));
            Assert.That(_bag.Entries.Count, Is.EqualTo(0));
        }

        [Test]
        public void Take_SplitsAStack()
        {
            _bag.TryAdd(Create(InventoryTestItems.Potion, 10));
            string id = _bag.Entries[0].InstanceId;

            ItemInstance taken = _bag.Take(id, 4);

            Assert.That(taken.Count, Is.EqualTo(4));
            Assert.That(taken.InstanceId, Is.Not.EqualTo(id));
            Assert.That(_bag.Find(id).Count, Is.EqualTo(6));
            Assert.That(_bag.Take(id, 6).InstanceId, Is.EqualTo(id), "taking all moves the instance itself");
            Assert.That(_bag.Entries.Count, Is.EqualTo(0));
        }

        [Test]
        public void Sorting_ByRarity_AndFilterByCategory()
        {
            _bag.TryAdd(Create(InventoryTestItems.Sword, 1, ItemRarity.Common));
            _bag.TryAdd(Create(InventoryTestItems.PlateChest, 1, ItemRarity.Epic));
            _bag.TryAdd(Create(InventoryTestItems.IronRing, 1, ItemRarity.Rare));
            _bag.TryAdd(Create(InventoryTestItems.WolfFur, 3));
            var result = new List<ItemInstance>();

            InventorySorting.Query(_bag.Entries, _catalog, InventoryFilter.All, InventorySortMode.Rarity, result);
            Assert.That(result.Count, Is.EqualTo(4));
            Assert.That(result[0].ItemId, Is.EqualTo(InventoryTestItems.PlateChest));
            Assert.That(result[1].ItemId, Is.EqualTo(InventoryTestItems.IronRing));

            InventorySorting.Query(_bag.Entries, _catalog, new InventoryFilter(ItemCategory.Weapon), InventorySortMode.Rarity, result);
            Assert.That(result.Count, Is.EqualTo(1));
            Assert.That(result[0].ItemId, Is.EqualTo(InventoryTestItems.Sword));

            InventorySorting.Query(_bag.Entries, _catalog, InventoryFilter.All, InventorySortMode.Weight, result);
            Assert.That(result[0].ItemId, Is.EqualTo(InventoryTestItems.PlateChest), "10 kg first");
        }
    }
}
