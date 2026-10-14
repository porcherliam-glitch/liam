using System.Collections.Generic;
using Aetherfall.Classes;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Classes of GDD 03 11.2: the class choice sets the class and the starting kit of the next new game, a new game starts with
    /// it, a loaded game keeps its own class (old saves without class: warrior), a class without kit keeps the inventory's kit;
    /// quick-use items with an effect are usable.
    /// </summary>
    [TestFixture]
    public sealed class ClassServiceTests
    {
        private InventoryTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment(withKit: false);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        private static ClassSpec Warrior()
        {
            return new ClassSpec("class.krieger", "Krieger", "Ich stehe, wo andere fallen.", string.Empty, new[] { 14f, 10f, 8f, 9f, 15f, 10f },
                new StartingKit(new[] { new StartingKitItem(InventoryTestItems.Sword, 1, 1, ItemRarity.Common, EquipmentSlot.MainHand) }, 0));
        }

        private static ClassSpec Mage()
        {
            return new ClassSpec("class.magier", "Magier", "Feuer, Eis und Sturm gehorchen mir.", string.Empty, new[] { 8f, 10f, 15f, 13f, 10f, 10f },
                new StartingKit(new[] { new StartingKitItem(InventoryTestItems.Potion, 3, 1, ItemRarity.Common, EquipmentSlot.None) }, 0));
        }

        [Test]
        public void ChosenClass_StartsTheNewGame_WithItsKit()
        {
            var service = new ClassService(new[] { Warrior(), Mage() }, _env.Inventory);
            var changes = new List<KeyValuePair<string, bool>>();
            service.Changed += (spec, newGame) => changes.Add(new KeyValuePair<string, bool>(spec.Id, newGame));

            Assert.That(service.Pending.Id, Is.EqualTo("class.krieger"), "the first class is the default");
            Assert.That(service.ChooseForNewGame("class.magier"), Is.True);
            service.StartNewGame();
            _env.Inventory.ResetToStartingKit();

            Assert.That(service.Current.Id, Is.EqualTo("class.magier"));
            Assert.That(changes, Is.EqualTo(new[] { new KeyValuePair<string, bool>("class.magier", true) }));
            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(3));
            Assert.That(_env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand), Is.Null, "no sword for the mage");
        }

        [Test]
        public void UnknownClass_IsRefused_AndThePendingClassStays()
        {
            var service = new ClassService(new[] { Warrior(), Mage() }, _env.Inventory);

            Assert.That(service.ChooseForNewGame("class.drache"), Is.False);
            Assert.That(service.Pending.Id, Is.EqualTo("class.krieger"));
        }

        [Test]
        public void LoadedGame_KeepsItsClass_OldSavesAreWarriors()
        {
            var service = new ClassService(new[] { Warrior(), Mage() }, _env.Inventory);
            bool? newGame = null;
            service.Changed += (spec, fresh) => newGame = fresh;

            service.RestoreGame("class.magier");
            Assert.That(service.Current.Id, Is.EqualTo("class.magier"));
            Assert.That(newGame, Is.False);

            service.RestoreGame(string.Empty);
            Assert.That(service.Current.Id, Is.EqualTo("class.krieger"));
        }

        [Test]
        public void ClassWithoutKit_KeepsTheKitOfTheInventory()
        {
            var testKit = new StartingKit(new[] { new StartingKitItem(InventoryTestItems.WolfFur, 2, 1, ItemRarity.Common, EquipmentSlot.None) }, 0);
            _env.Inventory.SetStartingKit(testKit);
            var service = new ClassService(new[] { new ClassSpec("class.krieger", "Krieger", string.Empty, string.Empty, null, null) }, _env.Inventory);

            service.StartNewGame();
            _env.Inventory.ResetToStartingKit();

            Assert.That(_env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(2));
        }

        [Test]
        public void ClassSpec_GivesTheAttributesOfGdd03()
        {
            ClassSpec mage = Mage();

            Assert.That(mage.Attribute(StatId.Intelligence), Is.EqualTo(15f));
            Assert.That(mage.Attribute(StatId.Strength), Is.EqualTo(8f));
            float sum = 0f;
            foreach (float value in mage.Attributes)
            {
                sum += value;
            }

            Assert.That(sum, Is.EqualTo(66f), "GDD 03 11.2: the start attributes add up to 66");
        }

        [Test]
        public void QuickUseItems_WithAnEffect_AreUsable()
        {
            var potion = new ItemSpec { EquipKind = EquipKind.QuickUse, RestoreHealth = 0.35f };
            var mana = new ItemSpec { EquipKind = EquipKind.QuickUse, RestoreMana = 0.4f };
            var plain = new ItemSpec { EquipKind = EquipKind.QuickUse };
            var armour = new ItemSpec { EquipKind = EquipKind.Chest, RestoreHealth = 1f };

            Assert.That(potion.IsUsable, Is.True);
            Assert.That(mana.IsUsable, Is.True);
            Assert.That(plain.IsUsable, Is.False);
            Assert.That(armour.IsUsable, Is.False);
        }
    }
}
