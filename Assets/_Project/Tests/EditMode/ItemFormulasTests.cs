using Aetherfall.Items;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Item formulas of GDD 04: item level (4.1), base values with spread (4.2, incl. the one-handed sword table and the
    /// warrior's W = 50), armor and implicit values, trade values (8.6) and the gold reference G(L) = 15 + 6 × L (8.7).
    /// </summary>
    [TestFixture]
    public sealed class ItemFormulasTests
    {
        [TestCase(8, 0, 8)]
        [TestCase(7, 1, 8)]
        [TestCase(30, 0, 30)]
        [TestCase(80, 2, 80)]
        [TestCase(0, 0, 1)]
        [TestCase(-5, 1, 1)]
        public void ItemLevel_IsClampedTo1To80(int sourceLevel, int delta, int expected)
        {
            Assert.That(ItemFormulas.ItemLevel(sourceLevel, delta), Is.EqualTo(expected));
        }

        [TestCase(1, ItemRarity.Common, 20f)]
        [TestCase(1, ItemRarity.Uncommon, 22f)]
        [TestCase(1, ItemRarity.Rare, 24f)]
        [TestCase(1, ItemRarity.Epic, 26f)]
        [TestCase(1, ItemRarity.Legendary, 28f)]
        [TestCase(10, ItemRarity.Common, 42f)]
        [TestCase(10, ItemRarity.Uncommon, 46f)]
        [TestCase(10, ItemRarity.Rare, 50f)]
        [TestCase(10, ItemRarity.Epic, 54f)]
        [TestCase(10, ItemRarity.Legendary, 58f)]
        [TestCase(30, ItemRarity.Common, 90f)]
        [TestCase(30, ItemRarity.Rare, 108f)]
        [TestCase(30, ItemRarity.Legendary, 125f)]
        [TestCase(60, ItemRarity.Common, 162f)]
        [TestCase(60, ItemRarity.Epic, 210f)]
        [TestCase(60, ItemRarity.Mythic, 250f)]
        [TestCase(80, ItemRarity.Common, 210f)]
        [TestCase(80, ItemRarity.Uncommon, 231f)]
        [TestCase(80, ItemRarity.Rare, 252f)]
        [TestCase(80, ItemRarity.Epic, 272f)]
        [TestCase(80, ItemRarity.Legendary, 293f)]
        [TestCase(80, ItemRarity.Mythic, 325f)]
        public void OneHandedSword_MatchesTheGddTable(int itemLevel, ItemRarity rarity, float expected)
        {
            ItemSpec sword = ItemTestCatalog.Weapon(ItemTestCatalog.Sword, WeaponType.OneHandedSword);
            var instance = new ItemInstance("0000000000000001", sword.Id, itemLevel, rarity, 1f, 1, ItemFlags.None, null);

            Assert.That(ItemStats.WeaponDamage(sword, instance), Is.EqualTo(expected));
        }

        [Test]
        public void Spread_ScalesTheBaseValue_AndStaysWithin095To105()
        {
            Assert.That(ItemFormulas.BaseValue(20f, 10, ItemRarity.Rare, 0.95f), Is.EqualTo(47.424f).Within(1e-3f));
            Assert.That(ItemFormulas.BaseValue(20f, 10, ItemRarity.Rare, 1.05f), Is.EqualTo(52.416f).Within(1e-3f));

            var random = new Aetherfall.Utilities.Pcg32Random(42UL);
            float min = 2f;
            float max = 0f;
            for (int i = 0; i < 5000; i++)
            {
                float spread = ItemGenerator.RollSpread(random);
                min = System.Math.Min(min, spread);
                max = System.Math.Max(max, spread);
            }

            Assert.That(min, Is.EqualTo(ItemFormulas.MinSpread).Within(1e-6f));
            Assert.That(max, Is.EqualTo(ItemFormulas.MaxSpread).Within(1e-6f));
        }

        [Test]
        public void WarriorArmor_PlateAndLeatherAtItemLevel10Uncommon_IsAbout60()
        {
            // GDD 04 4.2 check against 03 8.3: plate chest, legs, head, leather hands and feet, cloak: 26 × 2.08 × 1.1 ≈ 59;
            // each piece is rounded to a whole number, so the sum is 60 (03 assumes armor 60).
            string[] ids =
            {
                ItemTestCatalog.PlateChest, ItemTestCatalog.PlateLegs, ItemTestCatalog.IronHelmet, ItemTestCatalog.LeatherGloves,
                ItemTestCatalog.LeatherBoots, ItemTestCatalog.WoolCloak
            };
            ItemCatalog catalog = ItemTestCatalog.Create();
            float total = 0f;
            for (int i = 0; i < ids.Length; i++)
            {
                catalog.TryGetItem(ids[i], out ItemSpec spec);
                total += ItemStats.Armor(spec, new ItemInstance("000000000000000" + i, ids[i], 10, ItemRarity.Uncommon, 1f, 1, ItemFlags.None, null));
            }

            Assert.That(total, Is.EqualTo(60f));
        }

        [Test]
        public void ArmorTable_SumsPerClass_MatchGdd()
        {
            EquipKind[] slots = { EquipKind.Head, EquipKind.Chest, EquipKind.Hands, EquipKind.Legs, EquipKind.Feet, EquipKind.Cloak };
            float plate = 0f;
            float leather = 0f;
            float cloth = 0f;
            float plateWeight = 0f;
            for (int i = 0; i < slots.Length; i++)
            {
                plate += ArmorRules.BaseArmor(slots[i], ArmorClass.Heavy);
                leather += ArmorRules.BaseArmor(slots[i], ArmorClass.Medium);
                cloth += ArmorRules.BaseArmor(slots[i], ArmorClass.Light);
                plateWeight += ArmorRules.Weight(slots[i], ArmorClass.Heavy);
            }

            Assert.That(plate, Is.EqualTo(28f));
            Assert.That(leather, Is.EqualTo(19f));
            Assert.That(cloth, Is.EqualTo(10f));
            Assert.That(plateWeight, Is.EqualTo(28f));
        }

        [Test]
        public void Implicit_IsLinearFromLevel1To80()
        {
            Assert.That(ItemFormulas.ImplicitValue(2f, 30f, 1), Is.EqualTo(2f));
            Assert.That(ItemFormulas.ImplicitValue(2f, 30f, 80), Is.EqualTo(30f));
            Assert.That(ItemFormulas.ImplicitValue(10f, 150f, 40), Is.EqualTo(10f + 140f * 39f / 79f).Within(1e-4f));
        }

        [Test]
        public void TradeValue_MatchesTheGddExample()
        {
            // GDD 04 4.9 example: 40 × (1 + 0.15 × 29) × 6 = 1284 (one-handed weapon, item level 30, epic).
            Assert.That(ItemFormulas.TradeValue(40f, 30, ItemRarity.Epic), Is.EqualTo(1284f).Within(0.01f));
            Assert.That(ItemFormulas.TradeValue(70f, 1, ItemRarity.Common), Is.EqualTo(70f));
        }

        [TestCase(1, 21f)]
        [TestCase(8, 63f)]
        [TestCase(11, 81f)]
        [TestCase(80, 495f)]
        public void GoldReference_Is15Plus6L(int level, float expected)
        {
            Assert.That(ItemFormulas.GoldReference(level), Is.EqualTo(expected));
        }

        [Test]
        public void RequiredLevel_IsItemLevelMinus3()
        {
            Assert.That(ItemFormulas.RequiredPlayerLevel(10), Is.EqualTo(7));
            Assert.That(ItemFormulas.RequiredPlayerLevel(2), Is.EqualTo(1));
        }

        [Test]
        public void WeaponTable_MatchesGdd()
        {
            Assert.That(WeaponTypeRules.BaseValue(WeaponType.OneHandedSword), Is.EqualTo(20f));
            Assert.That(WeaponTypeRules.BaseValue(WeaponType.TwoHandedSword), Is.EqualTo(30f));
            Assert.That(WeaponTypeRules.BaseValue(WeaponType.Crossbow), Is.EqualTo(29f));
            Assert.That(WeaponTypeRules.Weight(WeaponType.OneHandedSword), Is.EqualTo(2.5f));
            Assert.That(WeaponTypeRules.EquipKindOf(WeaponType.TwoHandedSword), Is.EqualTo(EquipKind.TwoHanded));
            Assert.That(WeaponTypeRules.EquipKindOf(WeaponType.Shield), Is.EqualTo(EquipKind.OffHand));
            Assert.That(WeaponTypeRules.TempoMilliseconds(WeaponType.OneHandedSword), Is.EqualTo(450));
        }
    }
}
