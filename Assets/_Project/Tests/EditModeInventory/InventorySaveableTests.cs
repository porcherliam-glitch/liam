using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Save section <c>inventory</c> (architecture 9.3, ISaveable): bag, equipment, quick slots, gold, pity counters, the loot
    /// seed and counter and the opened chests survive a round trip through the JSON serializer of the save system; a missing
    /// section starts a new game with the starting kit; broken entries are dropped instead of breaking the load; counts above
    /// the stack size are split instead of cut, a shield next to a two-handed weapon goes into the bag.
    /// </summary>
    [TestFixture]
    public sealed class InventorySaveableTests
    {
        private static readonly LoadContext Context = new LoadContext("char_01/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private static InventoryDto RoundTrip(InventoryDto dto)
        {
            var serializer = new NewtonsoftJsonSerializer();
            string json = serializer.Serialize(dto, false);
            Assert.That(json, Does.Contain("\"lootSeed\""), "camelCase like every save section");
            return serializer.Deserialize<InventoryDto>(json);
        }

        [Test]
        public void KeyAndOrder()
        {
            using (var env = new InventoryTestEnvironment())
            {
                var saveable = new InventorySaveable(env.Inventory, env.Loot);

                Assert.That(saveable.SaveKey, Is.EqualTo("inventory"));
                Assert.That(saveable.LoadOrder, Is.EqualTo(50));
                Assert.That(saveable.DataType, Is.EqualTo(typeof(InventoryDto)));
                Assert.That(SaveDtoValidator.Validate(typeof(InventoryDto), out string problem), Is.True, problem);
            }
        }

        [Test]
        public void RoundTrip_KeepsInventoryEquipmentGoldPityAndChests()
        {
            InventoryDto saved;
            string legsId;
            string chestId;
            ulong seed;
            int gold;
            int pity;
            using (var source = new InventoryTestEnvironment(true, 11UL))
            {
                var affixes = new[] { new AffixRoll(InventoryTestItems.Vital, 3, 31f), new AffixRoll(InventoryTestItems.Steadfast, 2, 6f) };
                var legs = new ItemInstance("2222222222222222", InventoryTestItems.PlateLegs, 12, ItemRarity.Rare, 1.03f, 1, ItemFlags.Favorite, affixes);
                source.Inventory.TryAdd(InventoryOwners.Player, legs, "test");
                source.Inventory.TryEquip(legs.InstanceId, EquipmentSlot.Legs, out _);
                source.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.WolfFur, 120, "test");
                source.Inventory.TryChangeCurrency(InventoryOwners.Player, CurrencyIds.Gold, 345, "test");
                source.Loot.Pity.Restore(77, 4);
                Assert.That(source.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Wooden, 10, out _), Is.True);
                legsId = legs.InstanceId;
                chestId = source.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest).InstanceId;
                seed = source.Loot.SaveSeed;
                gold = source.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold);
                pity = source.Loot.Pity.LegendaryCounter;
                Assert.That(gold, Is.GreaterThan(345), "345 + chest gold");
                saved = RoundTrip((InventoryDto)new InventorySaveable(source.Inventory, source.Loot).Save());
                Assert.That(saved.Equipment["beine"].Affixes.Count, Is.EqualTo(2));
            }

            using (var target = new InventoryTestEnvironment(false, 99UL))
            {
                var saveable = new InventorySaveable(target.Inventory, target.Loot);
                saveable.Load(saved, Context);
                InventoryService inventory = target.Inventory;

                ItemInstance legs = inventory.PlayerEquipment.Get(EquipmentSlot.Legs);
                Assert.That(legs.InstanceId, Is.EqualTo(legsId));
                Assert.That(legs.ItemLevel, Is.EqualTo(12));
                Assert.That(legs.Rarity, Is.EqualTo(ItemRarity.Rare));
                Assert.That(legs.BaseRoll, Is.EqualTo(1.03f).Within(1e-5f));
                Assert.That(legs.IsFavorite, Is.True);
                Assert.That(legs.Affixes.Count, Is.EqualTo(2));
                Assert.That(legs.Affixes[0].AffixId, Is.EqualTo(InventoryTestItems.Vital));
                Assert.That(legs.Affixes[0].Tier, Is.EqualTo(3));
                Assert.That(legs.Affixes[0].Value, Is.EqualTo(31f));
                Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.Chest).InstanceId, Is.EqualTo(chestId));
                Assert.That(inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).ItemId, Is.EqualTo(InventoryTestItems.Sword));
                Assert.That(inventory.PlayerEquipment.GetQuickSlot(EquipmentSlot.QuickSlot1), Is.EqualTo(InventoryTestItems.Potion));
                Assert.That(inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(120));
                Assert.That(inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(3));
                Assert.That(inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(gold));
                Assert.That(target.Loot.Pity.LegendaryCounter, Is.EqualTo(pity));
                Assert.That(target.Loot.Pity.MythicCounter, Is.EqualTo(4));
                Assert.That(target.Loot.SaveSeed, Is.EqualTo(seed));
                Assert.That(target.Loot.IsChestOpened("obj.test.truhe_holz"), Is.True);
                Assert.That(target.Loot.IsChestOpened("obj.test.truhe_eisen"), Is.False);
            }
        }

        [Test]
        public void RoundTrip_SameStateTwice_GivesTheSameJson()
        {
            using (var env = new InventoryTestEnvironment(true, 5UL))
            {
                var serializer = new NewtonsoftJsonSerializer();
                var saveable = new InventorySaveable(env.Inventory, env.Loot);
                string first = serializer.Serialize(saveable.Save(), false);
                saveable.Load(serializer.Deserialize<InventoryDto>(first), Context);
                string second = serializer.Serialize(saveable.Save(), false);

                Assert.That(second, Is.EqualTo(first));
            }
        }

        [Test]
        public void MissingSection_StartsWithTheStartingKit()
        {
            using (var env = new InventoryTestEnvironment())
            {
                env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.WolfFur, 5, "test");
                env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Wooden, 10, out _);
                var saveable = new InventorySaveable(env.Inventory, env.Loot);

                saveable.Load(null, Context);

                Assert.That(env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(0));
                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).ItemId, Is.EqualTo(InventoryTestItems.Sword));
                Assert.That(env.Loot.IsChestOpened("obj.test.truhe_holz"), Is.False);
            }
        }

        [Test]
        public void RoundTrip_SeveralSingleItems_KeepsEveryPiece()
        {
            InventoryDto saved;
            using (var source = new InventoryTestEnvironment(false, 13UL))
            {
                source.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Sword, 3, "test");
                source.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Potion, 45, "test");
                saved = RoundTrip((InventoryDto)new InventorySaveable(source.Inventory, source.Loot).Save());
            }

            using (var target = new InventoryTestEnvironment(false, 14UL))
            {
                new InventorySaveable(target.Inventory, target.Loot).Load(saved, Context);

                Assert.That(target.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(3));
                Assert.That(target.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(45));
                Assert.That(target.Inventory.PlayerContainer.Entries.Count, Is.EqualTo(6), "3 swords, potions 20 + 20 + 5");
                Assert.That(target.LogCapture.Sink.Count(Aetherfall.Core.LogLevel.Warning), Is.EqualTo(0));
            }
        }

        [Test]
        public void Load_CountsAboveTheStackSize_AreSplit_NotCut()
        {
            using (var env = new InventoryTestEnvironment(false))
            {
                var dto = new InventoryDto();
                dto.Items.Add(new ItemInstanceDto { InstanceId = "1111111111111111", ItemId = InventoryTestItems.Sword, ItemLevel = 5, Rarity = "gewoehnlich", Count = 3 });
                dto.Items.Add(new ItemInstanceDto { InstanceId = "2222222222222222", ItemId = InventoryTestItems.Potion, ItemLevel = 1, Rarity = "gewoehnlich", Count = 45 });
                dto.Equipment["brust"] = new ItemInstanceDto { InstanceId = "3333333333333333", ItemId = InventoryTestItems.PlateChest, ItemLevel = 5, Rarity = "gewoehnlich", Count = 2 };

                new InventorySaveable(env.Inventory, env.Loot).Load(dto, Context);

                Assert.That(env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Sword), Is.EqualTo(3));
                Assert.That(env.Inventory.PlayerContainer.Find("1111111111111111").Count, Is.EqualTo(1));
                Assert.That(env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(45));
                Assert.That(env.Inventory.PlayerContainer.Find("2222222222222222").Count, Is.EqualTo(20));
                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest).InstanceId, Is.EqualTo("3333333333333333"));
                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest).Count, Is.EqualTo(1));
                Assert.That(env.Inventory.CountInBag(InventoryOwners.Player, InventoryTestItems.PlateChest), Is.EqualTo(1), "the second chest piece");
                Assert.That(env.LogCapture.Sink.Count(Aetherfall.Core.LogLevel.Warning), Is.GreaterThanOrEqualTo(3));
            }
        }

        [Test]
        public void Load_ShieldNextToATwoHandedWeapon_GoesIntoTheBag()
        {
            using (var env = new InventoryTestEnvironment(false))
            {
                var dto = new InventoryDto();
                dto.Equipment["haupthand"] = new ItemInstanceDto { InstanceId = "4444444444444444", ItemId = InventoryTestItems.TwoHandedSword, ItemLevel = 5, Rarity = "gewoehnlich", Count = 1 };
                dto.Equipment["nebenhand"] = new ItemInstanceDto { InstanceId = "5555555555555555", ItemId = InventoryTestItems.WoodenShield, ItemLevel = 5, Rarity = "gewoehnlich", Count = 1 };

                new InventorySaveable(env.Inventory, env.Loot).Load(dto, Context);

                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.MainHand).ItemId, Is.EqualTo(InventoryTestItems.TwoHandedSword));
                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.OffHand), Is.Null);
                Assert.That(env.Inventory.PlayerContainer.Find("5555555555555555"), Is.Not.Null);
                Assert.That(env.LogCapture.Sink.Count(Aetherfall.Core.LogLevel.Warning), Is.EqualTo(1));
            }
        }

        [Test]
        public void Load_MoreThanThousandEntries_LogsTheDroppedOnes()
        {
            using (var env = new InventoryTestEnvironment(false))
            {
                var dto = new InventoryDto();
                for (int i = 0; i < InventoryContainer.MaxEntries + 2; i++)
                {
                    dto.Items.Add(new ItemInstanceDto
                    {
                        InstanceId = (0x100000UL + (ulong)i).ToString("x16"), ItemId = InventoryTestItems.IronRing, ItemLevel = 1, Rarity = "gewoehnlich", Count = 1
                    });
                }

                new InventorySaveable(env.Inventory, env.Loot).Load(dto, Context);

                Assert.That(env.Inventory.PlayerContainer.Entries.Count, Is.EqualTo(InventoryContainer.MaxEntries));
                Assert.That(env.LogCapture.Sink.Count(Aetherfall.Core.LogLevel.Warning), Is.EqualTo(2));
            }
        }

        [Test]
        public void BrokenEntries_AreDropped_AndTheRestLoads()
        {
            using (var env = new InventoryTestEnvironment(false))
            {
                var dto = new InventoryDto();
                dto.Items.Add(new ItemInstanceDto { InstanceId = "3333333333333333", ItemId = InventoryTestItems.WolfFur, ItemLevel = 1, Rarity = "gewoehnlich", Count = 4 });
                dto.Items.Add(new ItemInstanceDto { InstanceId = "4444444444444444", ItemId = "item.test.geloescht", ItemLevel = 1, Rarity = "gewoehnlich", Count = 1 });
                dto.Items.Add(new ItemInstanceDto { InstanceId = "3333333333333333", ItemId = InventoryTestItems.WolfFur, ItemLevel = 1, Rarity = "gewoehnlich", Count = 2 });
                dto.Equipment["fluegel"] = new ItemInstanceDto { InstanceId = "5555555555555555", ItemId = InventoryTestItems.Sword, ItemLevel = 1, Rarity = "selten", Count = 1 };
                dto.Equipment["brust"] = new ItemInstanceDto { InstanceId = "6666666666666666", ItemId = InventoryTestItems.Sword, ItemLevel = 1, Rarity = "selten", Count = 1 };
                dto.Currencies[CurrencyIds.Gold] = 12;

                new InventorySaveable(env.Inventory, env.Loot).Load(dto, Context);

                Assert.That(env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(4));
                Assert.That(env.Inventory.PlayerEquipment.Get(EquipmentSlot.Chest), Is.Null);
                Assert.That(env.Inventory.PlayerContainer.Find("6666666666666666"), Is.Not.Null, "a sword in the chest slot goes into the bag");
                Assert.That(env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(12));
                Assert.That(env.LogCapture.Sink.Count(Aetherfall.Core.LogLevel.Warning), Is.GreaterThanOrEqualTo(3));
            }
        }
    }
}
