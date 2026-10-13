using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// <see cref="InventoryService"/> (architecture 11.6, events 4.3): the warrior's starting kit is equipped, equipping
    /// applies the item's stat modifiers with the source <c>item:&lt;instanceId&gt;</c> and unequipping removes all of them
    /// (RemoveAllFromSource), armor class poise, the events ItemPickedUp, InventoryChanged, CurrencyChanged and ItemEquipped,
    /// two-handed weapons send the shield to the bag, and quest items or locked items cannot be thrown away.
    /// </summary>
    [TestFixture]
    public sealed class InventoryServiceTests
    {
        private InventoryTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment();
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        private static float SumFromSource(StatCollection stats, StatId stat, string sourceId)
        {
            float total = 0f;
            IReadOnlyList<StatModifier> modifiers = stats.GetModifiers(stat);
            for (int i = 0; i < modifiers.Count; i++)
            {
                if (modifiers[i].SourceId == sourceId)
                {
                    total += modifiers[i].Value;
                }
            }

            return total;
        }

        private static int CountFromSourcePrefix(StatCollection stats, StatId stat, string prefix)
        {
            int count = 0;
            IReadOnlyList<StatModifier> modifiers = stats.GetModifiers(stat);
            for (int i = 0; i < modifiers.Count; i++)
            {
                if (modifiers[i].SourceId.StartsWith(prefix, System.StringComparison.Ordinal))
                {
                    count++;
                }
            }

            return count;
        }

        [Test]
        public void StartingKit_IsEquipped_PotionsAreInTheBagAndQuickSlot()
        {
            InventoryService inventory = _env.Inventory;

            Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).ItemId, Is.EqualTo(InventoryTestItems.Sword));
            Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).Rarity, Is.EqualTo(ItemRarity.Rare));
            Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.OffHand).ItemId, Is.EqualTo(InventoryTestItems.WoodenShield));
            Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.Chest).ItemId, Is.EqualTo(InventoryTestItems.PlateChest));
            Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.Feet).ItemId, Is.EqualTo(InventoryTestItems.LeatherBoots));
            Assert.That(inventory.PlayerEquipment.GetQuickSlot(EquipmentSlot.QuickSlot1), Is.EqualTo(InventoryTestItems.Potion));
            Assert.That(inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(3));
            Assert.That(inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(1), "equipped items count as owned");
            Assert.That(inventory.PlayerEncumbrance.Load, Is.EqualTo(2.5f + 4f + 10f + 1.5f + 0.9f).Within(1e-3f));

            ItemInstance sword = inventory.PlayerEquipment.Get(EquipmentSlot.MainHand);
            _env.Catalog.TryGetItem(sword.ItemId, out ItemSpec spec);
            Assert.That(ItemStats.WeaponDamage(spec, sword), Is.EqualTo(50f), "GDD 03 8.3: iron sword W = 50 (rare, item level 10)");
        }

        [Test]
        public void AttachStats_AddsTheArmorOfTheEquipment_WithItemSources()
        {
            var stats = new StatCollection();
            float before = stats.Get(StatId.Armor);
            _env.Inventory.AttachPlayerStats(stats);

            // Shield 6 × 2.08 = 12.5 → 12, plate chest 9 × 2.08 = 18.7 → 19, leather boots 3 × 2.08 = 6.2 → 6.
            Assert.That(stats.Get(StatId.Armor) - before, Is.EqualTo(37f).Within(1e-3f));
            ItemInstance chest = _env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest);
            Assert.That(SumFromSource(stats, StatId.Armor, "item:" + chest.InstanceId), Is.EqualTo(19f));
            Assert.That(CountFromSourcePrefix(stats, StatId.Armor, StatSourceIds.ItemPrefix), Is.EqualTo(3));
        }

        [Test]
        public void Equip_AddsModifiers_Unequip_RemovesAllFromTheSource()
        {
            StatCollection stats = _env.AttachWarriorStats();
            var affixes = new[] { new AffixRoll(InventoryTestItems.Vital, 2, 25f), new AffixRoll(InventoryTestItems.Steadfast, 2, 6f) };
            var legs = new ItemInstance("1111111111111111", InventoryTestItems.PlateLegs, 10, ItemRarity.Rare, 1f, 1, ItemFlags.New, affixes);
            Assert.That(_env.Inventory.TryAdd(InventoryOwners.Player, legs, "test"), Is.True);
            float health = stats.Get(StatId.MaxHealth);
            float armor = stats.Get(StatId.Armor);
            using (var equipped = new EventRecorder<ItemEquipped>(_env.Bus))
            {
                Assert.That(_env.Inventory.TryEquip(legs.InstanceId, EquipmentSlot.None, out string reason), Is.True, reason);

                Assert.That(equipped.Count, Is.EqualTo(1));
                Assert.That(equipped.Last.Slot, Is.EqualTo("beine"));
                Assert.That(equipped.Last.ItemInstanceId, Is.EqualTo("1111111111111111"));
                Assert.That(equipped.Last.ItemId, Is.EqualTo(InventoryTestItems.PlateLegs));
            }

            // Plate legs: 6 × 2.08 × 1.2 = 14.98 → 15 armor, +25 max. health, +6 poise.
            Assert.That(stats.Get(StatId.Armor) - armor, Is.EqualTo(15f).Within(1e-3f));
            Assert.That(stats.Get(StatId.MaxHealth) - health, Is.EqualTo(25f).Within(1e-3f));
            Assert.That(SumFromSource(stats, StatId.Poise, "item:1111111111111111"), Is.EqualTo(6f));
            Assert.That(legs.IsNew, Is.False, "equipping marks the item as seen");
            Assert.That(_env.Inventory.PlayerContainer.Find(legs.InstanceId), Is.Null);

            using (var equipped = new EventRecorder<ItemEquipped>(_env.Bus))
            {
                Assert.That(_env.Inventory.TryUnequip(EquipmentSlot.Legs, out _), Is.True);

                Assert.That(equipped.Last.Slot, Is.EqualTo("beine"));
                Assert.That(equipped.Last.IsEmpty, Is.True);
            }

            Assert.That(stats.Get(StatId.Armor), Is.EqualTo(armor).Within(1e-3f));
            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(health).Within(1e-3f));
            Assert.That(CountFromSourcePrefix(stats, StatId.Poise, "item:1111111111111111"), Is.EqualTo(0));
            Assert.That(_env.Inventory.PlayerContainer.Find(legs.InstanceId), Is.SameAs(legs));
        }

        [Test]
        public void Replacing_AnItem_RemovesTheOldModifiers()
        {
            StatCollection stats = _env.AttachWarriorStats();
            ItemInstance oldChest = _env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest);
            ItemInstance newChest = _env.AddToBag(InventoryTestItems.PlateChest, 13, ItemRarity.Epic);

            Assert.That(_env.Inventory.TryEquip(newChest.InstanceId, EquipmentSlot.Chest, out string reason), Is.True, reason);

            Assert.That(CountFromSourcePrefix(stats, StatId.Armor, "item:" + oldChest.InstanceId), Is.EqualTo(0));
            Assert.That(SumFromSource(stats, StatId.Armor, "item:" + newChest.InstanceId), Is.EqualTo(29f), "9 × 2.44 × 1.3 = 28.5 → 29");
            Assert.That(_env.Inventory.PlayerContainer.Find(oldChest.InstanceId), Is.SameAs(oldChest));
        }

        [Test]
        public void HeavyArmorClass_AddsPoise()
        {
            StatCollection stats = _env.AttachWarriorStats();
            Assert.That(SumFromSource(stats, StatId.Poise, PlayerStatBinding.ArmorClassSourceId), Is.EqualTo(0f), "plate chest + leather boots = light");

            _env.Inventory.TryEquip(_env.AddToBag(InventoryTestItems.PlateLegs).InstanceId, EquipmentSlot.Legs, out _);
            _env.Inventory.TryEquip(_env.AddToBag(InventoryTestItems.IronHelmet).InstanceId, EquipmentSlot.Head, out _);

            Assert.That(_env.Inventory.PlayerEquipment.ArmorClass, Is.EqualTo(ArmorClass.Heavy));
            Assert.That(SumFromSource(stats, StatId.Poise, PlayerStatBinding.ArmorClassSourceId), Is.EqualTo(30f));
        }

        [Test]
        public void TwoHandedWeapon_SendsTheShieldToTheBag()
        {
            ItemInstance twoHander = _env.AddToBag(InventoryTestItems.TwoHandedSword);
            ItemInstance shield = _env.Inventory.PlayerEquipment.Get(EquipmentSlot.OffHand);
            ItemInstance sword = _env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand);

            Assert.That(_env.Inventory.TryEquip(twoHander.InstanceId, EquipmentSlot.MainHand, out string reason), Is.True, reason);

            Assert.That(_env.Inventory.PlayerEquipment.Get(EquipmentSlot.OffHand), Is.Null);
            Assert.That(_env.Inventory.PlayerContainer.Find(shield.InstanceId), Is.Not.Null);
            Assert.That(_env.Inventory.PlayerContainer.Find(sword.InstanceId), Is.Not.Null);
            Assert.That(_env.Inventory.TryEquip(shield.InstanceId, EquipmentSlot.OffHand, out reason), Is.False);
            Assert.That(reason, Does.Contain("Nebenhand"));
        }

        [Test]
        public void TryAdd_PublishesPickedUpAndChanged()
        {
            using (var picked = new EventRecorder<ItemPickedUp>(_env.Bus))
            using (var changed = new EventRecorder<InventoryChanged>(_env.Bus))
            {
                Assert.That(_env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.WolfFur, 2, "loot.enemy.wolf.grauwolf"), Is.True);

                Assert.That(picked.Count, Is.EqualTo(1));
                Assert.That(picked.Last.ItemId, Is.EqualTo(InventoryTestItems.WolfFur));
                Assert.That(picked.Last.Amount, Is.EqualTo(2));
                Assert.That(picked.Last.SourceId, Is.EqualTo("loot.enemy.wolf.grauwolf"));
                Assert.That(changed.Last.OwnerId, Is.EqualTo(InventoryOwners.Player));
                Assert.That(changed.Last.NewCount, Is.EqualTo(2));
                Assert.That(changed.Last.Delta, Is.EqualTo(2));

                Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, InventoryTestItems.WolfFur, 1, "test"), Is.True);
                Assert.That(changed.Last.NewCount, Is.EqualTo(1));
                Assert.That(changed.Last.Delta, Is.EqualTo(-1));
                Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, InventoryTestItems.WolfFur, 5, "test"), Is.False);
                Assert.That(picked.Count, Is.EqualTo(1), "removing is no pickup");
            }
        }

        [Test]
        public void Gold_PublishesCurrencyChanged_AndCannotGoNegative()
        {
            using (var changed = new EventRecorder<CurrencyChanged>(_env.Bus))
            {
                Assert.That(_env.Inventory.TryChangeCurrency(InventoryOwners.Player, CurrencyIds.Gold, 120, "test"), Is.True);
                Assert.That(_env.Inventory.TryChangeCurrency(InventoryOwners.Player, CurrencyIds.Gold, -20, "test"), Is.True);
                Assert.That(_env.Inventory.TryChangeCurrency(InventoryOwners.Player, CurrencyIds.Gold, -500, "test"), Is.False);

                Assert.That(changed.Count, Is.EqualTo(2));
                Assert.That(changed.Last.CurrencyId, Is.EqualTo("currency.gold"));
                Assert.That(changed.Last.NewAmount, Is.EqualTo(100));
                Assert.That(changed.Last.Delta, Is.EqualTo(-20));
                Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(100));
            }
        }

        [Test]
        public void Drop_RefusesEquippedAndLockedItems()
        {
            ItemInstance sword = _env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand);
            Assert.That(_env.Inventory.TryTakeForDrop(sword.InstanceId, 1, out _, out string reason), Is.False);
            Assert.That(reason, Does.Contain("ablegen"));

            ItemInstance ring = _env.AddToBag(InventoryTestItems.IronRing, 10, ItemRarity.Legendary);
            Assert.That(ring.IsLocked, Is.True);
            Assert.That(_env.Inventory.TryTakeForDrop(ring.InstanceId, 1, out _, out reason), Is.False);
            Assert.That(reason, Does.Contain("Gesperrt"));

            ItemInstance potions = _env.FindInBag(InventoryTestItems.Potion);
            Assert.That(_env.Inventory.TryTakeForDrop(potions.InstanceId, 1, out ItemInstance taken, out reason), Is.True, reason);
            Assert.That(taken.Count, Is.EqualTo(1));
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(2));
        }

        [Test]
        public void TryAddNew_ThreeSwords_AreThreePieces_EquippingTakesOne()
        {
            using (var picked = new EventRecorder<ItemPickedUp>(_env.Bus))
            {
                Assert.That(_env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Sword, 3, "test"), Is.True);
                Assert.That(picked.Count, Is.EqualTo(1));
                Assert.That(picked.Last.Amount, Is.EqualTo(3));
            }

            ItemInstance bagSword = _env.FindInBag(InventoryTestItems.Sword);
            Assert.That(bagSword.Count, Is.EqualTo(1));
            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(3));
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(4), "3 in the bag + the equipped one");

            Assert.That(_env.Inventory.TryEquip(bagSword.InstanceId, EquipmentSlot.MainHand, out string reason), Is.True, reason);
            Assert.That(_env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).Count, Is.EqualTo(1));
            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(3), "2 left + the old sword");
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(4));
        }

        [Test]
        public void CountInBag_LeavesOutEquipment_LikeTryRemove()
        {
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.PlateChest), Is.EqualTo(1), "equipped chest counts as owned");
            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.PlateChest), Is.EqualTo(0));
            Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, InventoryTestItems.PlateChest, 1, "quest.test"), Is.False,
                "a hand-in never takes equipped pieces: check CountInBag before");
            Assert.That(_env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest), Is.Not.Null);

            _env.AddToBag(InventoryTestItems.PlateChest);
            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.PlateChest), Is.EqualTo(1));
            Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, InventoryTestItems.PlateChest, 1, "quest.test"), Is.True);
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.PlateChest), Is.EqualTo(1));
        }

        [Test]
        public void Revision_AndChangedEvent_FollowEveryChange()
        {
            int calls = 0;
            _env.Inventory.Changed += () => calls++;
            int revision = _env.Inventory.Revision;

            _env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.WolfFur, 1, "test");
            _env.Inventory.MarkAllSeen();

            Assert.That(calls, Is.EqualTo(2));
            Assert.That(_env.Inventory.Revision, Is.EqualTo(revision + 2));
            Assert.That(_env.FindInBag(InventoryTestItems.WolfFur).IsNew, Is.False);
        }
    }
}
