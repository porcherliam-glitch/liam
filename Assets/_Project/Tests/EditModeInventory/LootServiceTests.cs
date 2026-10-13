using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// <see cref="LootService"/> (GDD 04 5.4/5.6/5.9): an <c>EnemyKilled</c> with a loot table rolls loot (seeded by save
    /// seed, source and counter), places it in the world through the spawner or, without one, puts it into the bag, and
    /// sends <c>LootDropped</c>; chests open once, their content does not change on reload, and the auto pickup rules
    /// (gold 5 m, materials 3 m, nothing when almost full except quest items and keys).
    /// </summary>
    [TestFixture]
    public sealed class LootServiceTests
    {
        private InventoryTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment(true, 21UL);
            _env.Loot.PostInitialize();
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        private static EnemyKilled Kill(string uniqueId, string table = InventoryTestItems.WolfTable, string variant = "normal")
        {
            return new EnemyKilled("enemy.wolf.grauwolf", variant, uniqueId, "player", string.Empty, table, 8, default(Vector3));
        }

        [Test]
        public void EnemyKilled_WithoutSpawner_PutsTheLootIntoTheBag_AndSendsLootDropped()
        {
            using (var dropped = new EventRecorder<LootDropped>(_env.Bus))
            using (var picked = new EventRecorder<ItemPickedUp>(_env.Bus))
            {
                EnemyKilled evt = Kill("enemy.wolf.grauwolf#1");
                _env.Bus.Publish(in evt);

                Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(1), "fur is guaranteed");
                Assert.That(dropped.Count, Is.EqualTo(1));
                Assert.That(dropped.Last.LootTableId, Is.EqualTo(InventoryTestItems.WolfTable));
                Assert.That(ItemRarityIds.TryParse(dropped.Last.BestRarity, out _), Is.True, dropped.Last.BestRarity);
                Assert.That(picked.Count, Is.GreaterThanOrEqualTo(1));
                Assert.That(picked.Events[0].SourceId, Is.EqualTo(InventoryTestItems.WolfTable));
            }

            Assert.That(_env.Loot.RollCounter, Is.EqualTo(1));
        }

        [Test]
        public void EnemyWithoutLootTable_DropsNothing()
        {
            using (var dropped = new EventRecorder<LootDropped>(_env.Bus))
            {
                EnemyKilled evt = Kill("enemy.wolf.grauwolf#1", string.Empty);
                _env.Bus.Publish(in evt);

                Assert.That(dropped.Count, Is.EqualTo(0));
                Assert.That(_env.Loot.RollCounter, Is.EqualTo(0));
            }
        }

        [Test]
        public void WithSpawner_TheLootLiesInTheWorld_AndLoadingClearsIt()
        {
            var spawner = new RecordingLootSpawner();
            _env.Loot.RegisterSpawner(spawner);

            LootResult result = _env.Loot.RollEnemyLoot(Kill("enemy.wolf.grauwolf#2"));

            Assert.That(spawner.Drops.Count, Is.EqualTo(result.Drops.Count));
            Assert.That(spawner.LastSourceId, Is.EqualTo(InventoryTestItems.WolfTable));
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(0));

            var loaded = new GameLoaded("char_01/quick_0", 1);
            _env.Bus.Publish(in loaded);
            Assert.That(spawner.ClearCount, Is.EqualTo(1));

            _env.Loot.UnregisterSpawner(spawner);
            Assert.That(_env.Loot.HasSpawner, Is.False);
        }

        [Test]
        public void SameSeedAndCounter_GiveTheSameLoot_TheNextKillDiffers()
        {
            using (var other = new InventoryTestEnvironment(true, 21UL))
            {
                for (int i = 0; i < 20; i++)
                {
                    LootResult a = _env.Loot.RollEnemyLoot(Kill("enemy.wolf.grauwolf#1"));
                    LootResult b = other.Loot.RollEnemyLoot(Kill("enemy.wolf.grauwolf#1"));
                    Assert.That(b.Drops.Count, Is.EqualTo(a.Drops.Count));
                    for (int d = 0; d < a.Drops.Count; d++)
                    {
                        Assert.That(b.Drops[d].ToString(), Is.EqualTo(a.Drops[d].ToString()));
                    }
                }
            }

            Assert.That(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#1", 0), Is.EqualTo(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#1", 0)));
            Assert.That(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#1", 0), Is.Not.EqualTo(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#1", 1)));
            Assert.That(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#1", 0), Is.Not.EqualTo(LootSeeds.Combine(1UL, "enemy.wolf.grauwolf#2", 0)));
            Assert.That(LootSeeds.Combine(1UL, "a", 0), Is.Not.EqualTo(LootSeeds.Combine(2UL, "a", 0)));
        }

        [Test]
        public void Chest_OpensOnce_IntoTheBag()
        {
            int changes = 0;
            _env.Loot.ChestsChanged += () => changes++;
            int gold = _env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold);

            Assert.That(_env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Wooden, 10, out LootResult result), Is.True);
            Assert.That(_env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Wooden, 10, out _), Is.False);

            Assert.That(_env.Loot.IsChestOpened("obj.test.truhe_holz"), Is.True);
            Assert.That(changes, Is.EqualTo(1));
            Assert.That(result.CurrencyTotal(CurrencyIds.Gold), Is.EqualTo(19), "0.25 × G(10) = 18.75 → 19");
            Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(gold + 19));
            Assert.That(result.HasItems, Is.True);
            Assert.That(result.Drops[1].Item.ItemLevel, Is.EqualTo(10));
        }

        [Test]
        public void Chest_SameSave_SameContent_DifferentChest_DifferentContent()
        {
            _env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Iron, 10, out LootResult first);
            ulong seed = _env.Loot.SaveSeed;

            // "Reload" the save before the chest was opened: same save seed, chest closed again.
            _env.Loot.LoadState(seed, 0, 0, 0, null);
            Assert.That(_env.Loot.IsChestOpened("obj.test.truhe_holz"), Is.False);
            _env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Iron, 10, out LootResult again);

            Assert.That(again.Drops.Count, Is.EqualTo(first.Drops.Count));
            Assert.That(again.Drops[1].Item.ItemId, Is.EqualTo(first.Drops[1].Item.ItemId));
            Assert.That(again.Drops[1].Item.Rarity, Is.EqualTo(first.Drops[1].Item.Rarity));
            Assert.That(again.Drops[1].Item.InstanceId, Is.EqualTo(first.Drops[1].Item.InstanceId));
        }

        [Test]
        public void HiddenChest_GivesAtLeastRare()
        {
            for (int i = 0; i < 30; i++)
            {
                string id = "obj.test.versteckt_" + i;
                Assert.That(_env.Loot.TryOpenChest(id, InventoryTestItems.ChestTable, ChestTier.Hidden, 10, out LootResult result), Is.True);
                Assert.That(RarityRules.Rank(result.BestRarity), Is.GreaterThanOrEqualTo(RarityRules.Rank(ItemRarity.Rare)));
            }
        }

        [Test]
        public void ChestTiers_MatchTheGddTable()
        {
            Assert.That(ChestTierRules.LootQuality(ChestTier.Wooden), Is.EqualTo(1));
            Assert.That(ChestTierRules.LootQuality(ChestTier.Iron), Is.EqualTo(2));
            Assert.That(ChestTierRules.LootQuality(ChestTier.Hidden), Is.EqualTo(3));
            Assert.That(ChestTierRules.LootQuality(ChestTier.Ornate), Is.EqualTo(4));
            Assert.That(ChestTierRules.ItemLevelDelta(ChestTier.Ornate), Is.EqualTo(1));
            Assert.That(ChestTierRules.ItemLevelDelta(ChestTier.Secret), Is.EqualTo(2));
            Assert.That(ChestTierRules.GermanName(ChestTier.Iron), Is.EqualTo("Eisentruhe"));
        }

        [Test]
        public void AutoPickup_GoldAndMaterials()
        {
            _env.Catalog.TryGetItem(InventoryTestItems.WolfFur, out ItemSpec fur);
            _env.Catalog.TryGetItem(InventoryTestItems.Sword, out ItemSpec sword);
            var furItem = new ItemInstance("7777777777777777", fur.Id, 1, ItemRarity.Common, 1f, 2, ItemFlags.None, null);
            var swordItem = new ItemInstance("8888888888888888", sword.Id, 10, ItemRarity.Epic, 1f, 1, ItemFlags.None, null);
            LootDrop gold = LootDrop.ForCurrency(CurrencyIds.Gold, 12);
            LootDrop furDrop = LootDrop.ForItem(furItem);
            LootDrop swordDrop = LootDrop.ForItem(swordItem);
            const AutoPickupMode standard = AutoPickupMode.GoldAndMaterials;

            Assert.That(AutoPickupRules.ShouldCollect(standard, gold, null, 4.9f, EncumbranceLevel.Normal, false), Is.True);
            Assert.That(AutoPickupRules.ShouldCollect(standard, gold, null, 5.1f, EncumbranceLevel.Normal, false), Is.False);
            Assert.That(AutoPickupRules.ShouldCollect(standard, furDrop, fur, 2.9f, EncumbranceLevel.Normal, false), Is.True);
            Assert.That(AutoPickupRules.ShouldCollect(standard, furDrop, fur, 3.1f, EncumbranceLevel.Normal, false), Is.False);
            Assert.That(AutoPickupRules.ShouldCollect(standard, furDrop, fur, 1f, EncumbranceLevel.AlmostFull, false), Is.False, "almost full");
            Assert.That(AutoPickupRules.ShouldCollect(standard, gold, null, 1f, EncumbranceLevel.HeavilyOverloaded, false), Is.True, "gold weighs 0");
            Assert.That(AutoPickupRules.ShouldCollect(standard, swordDrop, sword, 1f, EncumbranceLevel.Normal, false), Is.False);
            Assert.That(AutoPickupRules.ShouldCollect(AutoPickupMode.All, swordDrop, sword, 1f, EncumbranceLevel.Normal, false), Is.True);
            Assert.That(AutoPickupRules.ShouldCollect(AutoPickupMode.All, swordDrop, sword, 1f, EncumbranceLevel.Normal, true), Is.False, "not in combat");
            Assert.That(AutoPickupRules.ShouldCollect(AutoPickupMode.Off, gold, null, 1f, EncumbranceLevel.Normal, false), Is.False);
            Assert.That(_env.Loot.ShouldAutoCollect(gold, 2f, false), Is.True);
        }

        [Test]
        public void ResetForNewGame_ClearsChestsPityAndCounter()
        {
            _env.Loot.TryOpenChest("obj.test.truhe_holz", InventoryTestItems.ChestTable, ChestTier.Wooden, 10, out _);
            _env.Loot.RollEnemyLoot(Kill("enemy.wolf.grauwolf#1"));
            _env.Loot.Pity.Restore(40, 2);

            _env.Loot.ResetForNewGame();

            Assert.That(_env.Loot.IsChestOpened("obj.test.truhe_holz"), Is.False);
            Assert.That(_env.Loot.RollCounter, Is.EqualTo(0));
            Assert.That(_env.Loot.Pity.LegendaryCounter, Is.EqualTo(0));
            Assert.That(_env.Loot.Chests.Count, Is.EqualTo(0));
        }
    }
}
