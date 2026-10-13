using Aetherfall.Inventory;
using Aetherfall.Items;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Equipment slots of §12.2 / GDD 04 2.3: 6 armor slots, main and off hand, ranged, 2 rings, amulet, 4 quick slots;
    /// what fits where, the level requirement (item level − 3), two-handed weapons lock the off hand, slot suggestions, slot
    /// ids for saves and events, and the armor class by relative majority (empty = light, tie = heavier).
    /// </summary>
    [TestFixture]
    public sealed class EquipmentRulesTests
    {
        private ItemCatalog _catalog;
        private Equipment _equipment;

        [SetUp]
        public void SetUp()
        {
            _catalog = InventoryTestItems.CreateCatalog();
            _equipment = new Equipment(_catalog);
        }

        private ItemSpec Spec(string id)
        {
            _catalog.TryGetItem(id, out ItemSpec spec);
            return spec;
        }

        private static ItemInstance Instance(string itemId, int itemLevel = 10)
        {
            return new ItemInstance("00000000000000" + (itemId.Length % 90 + 10), itemId, itemLevel, ItemRarity.Common, 1f, 1, ItemFlags.None, null);
        }

        [Test]
        public void Slots_MatchTheGdd()
        {
            Assert.That(EquipmentSlotIds.All.Length, Is.EqualTo(16));
            Assert.That(EquipmentSlotIds.ToId(EquipmentSlot.MainHand), Is.EqualTo("haupthand"));
            Assert.That(EquipmentSlotIds.ToId(EquipmentSlot.Ring2), Is.EqualTo("ring_2"));
            Assert.That(EquipmentSlotIds.ToId(EquipmentSlot.QuickSlot4), Is.EqualTo("schnellslot_4"));
            for (int i = 0; i < EquipmentSlotIds.All.Length; i++)
            {
                EquipmentSlot slot = EquipmentSlotIds.All[i];
                Assert.That(EquipmentSlotIds.TryParse(EquipmentSlotIds.ToId(slot), out EquipmentSlot back), Is.True);
                Assert.That(back, Is.EqualTo(slot));
            }
        }

        [TestCase(EquipKind.OneHanded, EquipmentSlot.MainHand, true)]
        [TestCase(EquipKind.TwoHanded, EquipmentSlot.MainHand, true)]
        [TestCase(EquipKind.TwoHanded, EquipmentSlot.OffHand, false)]
        [TestCase(EquipKind.OffHand, EquipmentSlot.OffHand, true)]
        [TestCase(EquipKind.Ring, EquipmentSlot.Ring2, true)]
        [TestCase(EquipKind.Chest, EquipmentSlot.Legs, false)]
        [TestCase(EquipKind.QuickUse, EquipmentSlot.QuickSlot1, false)]
        public void Fits(EquipKind kind, EquipmentSlot slot, bool expected)
        {
            Assert.That(Equipment.Fits(kind, slot), Is.EqualTo(expected));
        }

        [Test]
        public void CanEquip_ChecksSlotLevelAndQuickSlots()
        {
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.Sword), Instance(InventoryTestItems.Sword, 10), EquipmentSlot.MainHand, 7, out _),
                Is.True);
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.Sword), Instance(InventoryTestItems.Sword, 10), EquipmentSlot.MainHand, 6,
                out string level), Is.False);
            Assert.That(level, Does.Contain("Level 7"));
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.Sword), null, EquipmentSlot.Chest, 10, out string slot), Is.False);
            Assert.That(slot, Does.Contain("Brust"));
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.Potion), null, EquipmentSlot.QuickSlot2, 1, out _), Is.True);
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.Sword), null, EquipmentSlot.QuickSlot2, 10, out _), Is.False);
        }

        [Test]
        public void TwoHandedWeapon_LocksTheOffHand()
        {
            _equipment.Set(EquipmentSlot.MainHand, Instance(InventoryTestItems.TwoHandedSword));

            Assert.That(_equipment.IsOffHandLocked(), Is.True);
            Assert.That(_equipment.CanEquip(Spec(InventoryTestItems.WoodenShield), null, EquipmentSlot.OffHand, 10, out string reason), Is.False);
            Assert.That(reason, Does.Contain("Nebenhand"));
        }

        [Test]
        public void SuggestSlot_UsesTheFreeRing()
        {
            Assert.That(_equipment.SuggestSlot(Spec(InventoryTestItems.IronRing)), Is.EqualTo(EquipmentSlot.Ring1));
            _equipment.Set(EquipmentSlot.Ring1, Instance(InventoryTestItems.IronRing));
            Assert.That(_equipment.SuggestSlot(Spec(InventoryTestItems.IronRing)), Is.EqualTo(EquipmentSlot.Ring2));
            Assert.That(_equipment.SuggestSlot(Spec(InventoryTestItems.WoodenShield)), Is.EqualTo(EquipmentSlot.OffHand));
            Assert.That(_equipment.SuggestSlot(Spec(InventoryTestItems.Potion)), Is.EqualTo(EquipmentSlot.QuickSlot1));
        }

        [TestCase(ArmorClass.None, ArmorClass.None, ArmorClass.None, ArmorClass.None, ArmorClass.None, ArmorClass.Light)]
        [TestCase(ArmorClass.Heavy, ArmorClass.Heavy, ArmorClass.Heavy, ArmorClass.Medium, ArmorClass.Medium, ArmorClass.Heavy)]
        [TestCase(ArmorClass.Heavy, ArmorClass.Heavy, ArmorClass.Medium, ArmorClass.Medium, ArmorClass.Light, ArmorClass.Heavy)]
        [TestCase(ArmorClass.None, ArmorClass.Heavy, ArmorClass.None, ArmorClass.Medium, ArmorClass.None, ArmorClass.Light)]
        [TestCase(ArmorClass.Medium, ArmorClass.Medium, ArmorClass.Light, ArmorClass.Light, ArmorClass.Heavy, ArmorClass.Medium)]
        public void ArmorClass_IsTheRelativeMajority(ArmorClass head, ArmorClass chest, ArmorClass hands, ArmorClass legs, ArmorClass feet,
            ArmorClass expected)
        {
            Assert.That(ArmorRules.Resolve(head, chest, hands, legs, feet), Is.EqualTo(expected));
        }

        [Test]
        public void ArmorClass_PoiseBonus()
        {
            Assert.That(ArmorRules.PoiseBonus(ArmorClass.Light), Is.EqualTo(0f));
            Assert.That(ArmorRules.PoiseBonus(ArmorClass.Medium), Is.EqualTo(15f));
            Assert.That(ArmorRules.PoiseBonus(ArmorClass.Heavy), Is.EqualTo(30f));
        }
    }
}
