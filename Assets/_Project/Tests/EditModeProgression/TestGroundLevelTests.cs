using Aetherfall.Core;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The levels of the test ground fit together (<see cref="TestGroundLevels"/>): a new game starts at the level of the test
    /// character (10, like guide 05 and GDD 03 8.3: 328 health points with constitution 18), the starting equipment, the chest
    /// loot and the wolf loot can be equipped at that level (GDD 04 2.4: player level ≥ item level − 3, guide 06 7.2), and the
    /// test quests are made for it (no overlevel attenuation, level-up with the second quest, guide 09).
    /// </summary>
    /// <remarks>
    /// The chain is the one of the game: the progression sets the level of the player's stats, the inventory reads the level
    /// from the same stats for the level requirement.
    /// </remarks>
    [TestFixture]
    public sealed class TestGroundLevelTests
    {
        private const string SwordId = "item.weapon.einhandschwert_eisen";
        private const string ShieldId = "item.weapon.holzschild";
        private const string ChestArmorId = "item.armor.gambeson_wams";

        private static readonly ChestTier[] TestGroundChests = { ChestTier.Wooden, ChestTier.Iron, ChestTier.Hidden };

        private LogCapture _log;
        private EventBus _bus;
        private ItemCatalog _catalog;
        private int _nextId;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _catalog = new ItemCatalog();
            _catalog.AddItem(Weapon(SwordId, WeaponType.OneHandedSword));
            _catalog.AddItem(Weapon(ShieldId, WeaponType.Shield));
            _catalog.AddItem(new ItemSpec
            {
                Id = ChestArmorId, DisplayName = "Gambeson-Wams", Category = ItemCategory.Armor, EquipKind = EquipKind.Chest, ArmorClass = ArmorClass.Light,
                Weight = ArmorRules.Weight(EquipKind.Chest, ArmorClass.Light), Value = ArmorRules.ValueCategory(EquipKind.Chest),
                BaseStat = ArmorRules.BaseArmor(EquipKind.Chest, ArmorClass.Light)
            });
            _nextId = 0;
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Levels_AreTheOnesOfTheGuides()
        {
            Assert.That(TestGroundLevels.PlayerStartLevel, Is.EqualTo(10), "guide 05: warrior of level 10 (GDD 03 8.3)");
            Assert.That(TestGroundLevels.AreaLevel, Is.EqualTo(10), "guide 06: starting equipment and chests item level 10");
            Assert.That(TestGroundLevels.WolfLevel, Is.EqualTo(8), "guides 05 and 06: grey wolf level 8");
        }

        [Test]
        public void NewGame_StartsAtTheTestLevel_With328HealthPoints()
        {
            using (var player = new TestPlayer(_bus, _catalog, TestGroundLevels.PlayerStartLevel))
            {
                new ProgressionSaveable(player.Progression).Load(null, LoadContext.NewGame);

                Assert.That(player.Progression.Level, Is.EqualTo(10));
                Assert.That(player.Progression.XpIntoLevel, Is.EqualTo(0));
                Assert.That(player.Progression.UnspentAttributePoints, Is.EqualTo(0), "the warrior's points are in its base values (GDD 03 8.3)");
                Assert.That(player.Stats.Get(StatId.Level), Is.EqualTo(10f));
                Assert.That(player.Stats.Get(StatId.MaxHealth), Is.EqualTo(328f).Within(0.01f), "100 + 15 × E(18) + 12 × (10 − 1), guide 05");
                Assert.That(player.Inventory.PlayerLevel, Is.EqualTo(10));
            }
        }

        [Test]
        public void StartingEquipment_CanBeTakenOffAndPutOnAgain_AtTheStartLevel()
        {
            using (var player = new TestPlayer(_bus, _catalog, TestGroundLevels.PlayerStartLevel))
            {
                // Guide 06 7.2: "Schild ablegen … wieder anlegen → 28", sword and chest the same way.
                AssertEquips(player, SwordId, TestGroundLevels.AreaLevel, EquipmentSlot.MainHand);
                AssertEquips(player, ShieldId, TestGroundLevels.AreaLevel, EquipmentSlot.OffHand);
                AssertEquips(player, ChestArmorId, TestGroundLevels.AreaLevel, EquipmentSlot.Chest);

                Assert.That(player.Inventory.TryUnequip(EquipmentSlot.OffHand, out string off), Is.True, off);
                string shieldId = FindInBag(player, ShieldId);
                Assert.That(player.Inventory.TryEquip(shieldId, EquipmentSlot.OffHand, out string again), Is.True, again);
            }
        }

        [Test]
        public void ChestAndWolfLoot_CanBeEquippedAtTheStartLevel()
        {
            using (var player = new TestPlayer(_bus, _catalog, TestGroundLevels.PlayerStartLevel))
            {
                for (int i = 0; i < TestGroundChests.Length; i++)
                {
                    int itemLevel = ItemFormulas.ItemLevel(TestGroundLevels.AreaLevel, ChestTierRules.ItemLevelDelta(TestGroundChests[i]));
                    Assert.That(ItemFormulas.RequiredPlayerLevel(itemLevel), Is.LessThanOrEqualTo(TestGroundLevels.PlayerStartLevel), TestGroundChests[i].ToString());
                    AssertEquips(player, ChestArmorId, itemLevel, EquipmentSlot.Chest);
                }

                AssertEquips(player, SwordId, TestGroundLevels.WolfLevel, EquipmentSlot.MainHand);
            }
        }

        [Test]
        public void AtLevel1_TheTestGroundItemsCouldNotBeEquipped()
        {
            // Why the test ground needs its start level: item level 10 asks for level 7 (GDD 04 2.4), wolf loot for level 5.
            using (var player = new TestPlayer(_bus, _catalog, 1))
            {
                string sword = Add(player, SwordId, TestGroundLevels.AreaLevel);
                Assert.That(player.Inventory.TryEquip(sword, EquipmentSlot.MainHand, out string reason), Is.False);
                Assert.That(reason, Does.Contain("Level 7"));

                string wolfLoot = Add(player, ChestArmorId, TestGroundLevels.WolfLevel);
                Assert.That(player.Inventory.TryEquip(wolfLoot, EquipmentSlot.Chest, out string wolfReason), Is.False);
                Assert.That(wolfReason, Does.Contain("Level 5"));
            }
        }

        [Test]
        public void TestQuests_AreMadeForTheStartLevel()
        {
            XpCurve curve = XpCurve.Default;
            int perQuest = ProgressionRules.QuestLevelShareXp(curve, TestGroundQuestLibrary.RewardLevelShare, TestGroundQuestLibrary.RecommendedLevel,
                TestGroundLevels.PlayerStartLevel);

            Assert.That(TestGroundQuestLibrary.RecommendedLevel, Is.EqualTo(TestGroundLevels.PlayerStartLevel));
            Assert.That(ProgressionRules.OverlevelFactor(TestGroundLevels.PlayerStartLevel, TestGroundQuestLibrary.RecommendedLevel), Is.EqualTo(1f));
            Assert.That(perQuest, Is.EqualTo(1110), "0.5 × XP_next(10) = 0.5 × 2220 (guide 09)");
            Assert.That(perQuest, Is.LessThan(curve.XpToNext(TestGroundLevels.PlayerStartLevel)), "no level-up after the first quest");
            Assert.That(2 * perQuest, Is.GreaterThanOrEqualTo(curve.XpToNext(TestGroundLevels.PlayerStartLevel)), "level 11 after the second quest");
        }

        private void AssertEquips(TestPlayer player, string itemId, int itemLevel, EquipmentSlot slot)
        {
            string instanceId = Add(player, itemId, itemLevel);
            Assert.That(player.Inventory.TryEquip(instanceId, slot, out string reason), Is.True,
                itemId + " (item level " + itemLevel + ") at level " + player.Progression.Level + ": " + reason);
        }

        private string Add(TestPlayer player, string itemId, int itemLevel)
        {
            _nextId++;
            string instanceId = "000000000000" + (0xa000 + _nextId).ToString("x4");
            var instance = new ItemInstance(instanceId, itemId, itemLevel, ItemRarity.Common, 1f, 1, ItemFlags.None, null);
            Assert.That(player.Inventory.TryAdd(InventoryOwners.Player, instance, "test"), Is.True);
            return instanceId;
        }

        private static string FindInBag(TestPlayer player, string itemId)
        {
            foreach (ItemInstance instance in player.Inventory.PlayerContainer.Entries)
            {
                if (instance.ItemId == itemId)
                {
                    return instance.InstanceId;
                }
            }

            Assert.Fail(itemId + " is not in the bag.");
            return string.Empty;
        }

        private static ItemSpec Weapon(string id, WeaponType type)
        {
            return new ItemSpec
            {
                Id = id, DisplayName = id, Category = ItemCategory.Weapon, EquipKind = WeaponTypeRules.EquipKindOf(type), WeaponType = type,
                Weight = WeaponTypeRules.Weight(type), Value = WeaponTypeRules.ValueCategory(type), BaseStat = WeaponTypeRules.BaseValue(type)
            };
        }

        /// <summary>Player stats bound to progression and inventory, like PlayerProgression and the inventory binding do it.</summary>
        private sealed class TestPlayer : System.IDisposable
        {
            public TestPlayer(EventBus bus, ItemCatalog catalog, int startLevel)
            {
                Stats = new StatCollection(StatFormulaSet.CreateDefault(), StatRuleSet.Create(StatActorKind.Player));
                for (int i = 0; i < StatIds.Attributes.Length; i++)
                {
                    Stats.SetBase(StatIds.Attributes[i], 11f);
                }

                // The test character of the test ground menu (GDD 03 8.3).
                Stats.SetBase(StatId.Strength, 20f);
                Stats.SetBase(StatId.Dexterity, 10f);
                Stats.SetBase(StatId.Constitution, 18f);
                Stats.SetBase(StatId.Level, TestGroundLevels.PlayerStartLevel);
                Progression = new ProgressionService(bus, null, null, startLevel);
                Inventory = new InventoryService(bus, catalog, 11UL, StartingKit.Empty);
                Progression.AttachPlayerStats(Stats);
                Inventory.AttachPlayerStats(Stats);
            }

            public StatCollection Stats { get; }

            public ProgressionService Progression { get; }

            public InventoryService Inventory { get; }

            public void Dispose()
            {
                Inventory.DetachPlayerStats(Stats);
                Progression.Dispose();
            }
        }
    }
}
