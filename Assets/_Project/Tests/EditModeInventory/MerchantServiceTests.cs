using System.Linq;
using Aetherfall.Economy;
using Aetherfall.GameTime;
using Aetherfall.Items;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>Merchants of GDD 04 8.2 and 8.4: prices, buying, selling, buyback, restock, gold refill and saving.</summary>
    [TestFixture]
    public sealed class MerchantServiceTests
    {
        private const string SmithId = "merchant.test.schmiede";

        private InventoryTestEnvironment _env;
        private FakeClock _clock;
        private MerchantDefinition _smith;
        private MerchantService _merchants;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment(withKit: false);
            _env.AttachWarriorStats();
            _clock = new FakeClock();
            _smith = CreateMerchant(SmithId, "npc.test.tobold", MerchantKind.Weaponsmith, 800,
                new MerchantStockEntry(InventoryTestItems.Sword, 2), new MerchantStockEntry(InventoryTestItems.Potion, 5));
            _merchants = new MerchantService(_env.Inventory, _clock, () => 4, new[] { _smith }, 42UL);
            _env.Inventory.TryChangeCurrency(MerchantService.PlayerId, CurrencyIds.Gold, 5000, "test");
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_smith);
            _env.Dispose();
        }

        [Test]
        public void Prices_StayInsideTheLimitsOfGdd04()
        {
            Assert.That(MerchantPricing.BuyPrice(100f, 80f, 1f), Is.EqualTo(75), "charisma gives at most 25 % off");
            Assert.That(MerchantPricing.BuyPrice(100f, 0f, MerchantPricing.Surplus), Is.EqualTo(85));
            Assert.That(MerchantPricing.BuyPrice(100f, 80f, MerchantPricing.Surplus), Is.EqualTo(64), "0.75 × 0.85 = 0.6375");
            Assert.That(MerchantPricing.SellPrice(100f, ItemCategory.Weapon, 0f, 1f, 0), Is.EqualTo(20));
            Assert.That(MerchantPricing.SellPrice(100f, ItemCategory.Misc, 80f, MerchantPricing.ScarceSell, 0), Is.EqualTo(50), "never above 50 %");
            Assert.That(MerchantPricing.Demand(4), Is.EqualTo(0.8f).Within(1e-5f));
            Assert.That(MerchantPricing.Demand(30), Is.EqualTo(0.5f));
            Assert.That(MerchantPricing.GoldStock(400, 5), Is.EqualTo(600), "GDD 04 8.2: general goods in the Eichental");
        }

        [Test]
        public void Buy_TakesGold_GivesTheItem_AndEmptiesTheStock()
        {
            MerchantOffer sword = _merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Sword);
            int gold = Gold();
            int merchantGold = _merchants.Gold(SmithId);

            Assert.That(sword.ItemLevel, Is.EqualTo(6), "player level 4, weaponsmith +2");
            Assert.That(_merchants.TryBuy(SmithId, sword.Index, 1, out string reason), Is.True, reason);
            Assert.That(Gold(), Is.EqualTo(gold - sword.Price));
            Assert.That(_merchants.Gold(SmithId), Is.EqualTo(merchantGold + sword.Price));
            Assert.That(_env.FindInBag(InventoryTestItems.Sword).ItemLevel, Is.EqualTo(6));
            Assert.That(_merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Sword).Count, Is.EqualTo(1));

            Assert.That(_merchants.TryBuy(SmithId, sword.Index, 1, out _), Is.True);
            Assert.That(_merchants.TryBuy(SmithId, sword.Index, 1, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("Ausverkauft."));
            Assert.That(_merchants.Offers(SmithId).Any(o => o.ItemId == InventoryTestItems.Sword), Is.False);
        }

        [Test]
        public void Buy_WithoutEnoughGold_ChangesNothing()
        {
            _env.Inventory.TryChangeCurrency(MerchantService.PlayerId, CurrencyIds.Gold, -Gold(), "test");
            MerchantOffer sword = _merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Sword);

            Assert.That(_merchants.TryBuy(SmithId, sword.Index, 1, out string reason), Is.False);
            Assert.That(reason, Does.StartWith("Nicht genug Gold"));
            Assert.That(_env.FindInBag(InventoryTestItems.Sword), Is.Null);
            Assert.That(_merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Sword).Count, Is.EqualTo(2));
        }

        [Test]
        public void Sell_PaysLessForEachFurtherPiece_AndKeepsItForBuyback()
        {
            ItemInstance first = _env.AddToBag(InventoryTestItems.Sword, 6);
            ItemInstance second = _env.AddToBag(InventoryTestItems.Sword, 6);
            int firstPrice = _merchants.SellPrice(SmithId, first);
            int gold = Gold();

            Assert.That(_merchants.TrySell(SmithId, first.InstanceId, 1, out string reason), Is.True, reason);
            Assert.That(Gold(), Is.EqualTo(gold + firstPrice));
            Assert.That(_merchants.SellPrice(SmithId, second), Is.LessThan(firstPrice), "demand −5 %");
            Assert.That(_merchants.Buyback(SmithId).Count, Is.EqualTo(1));

            Assert.That(_merchants.TryBuyBack(SmithId, 0, out reason), Is.True, reason);
            Assert.That(Gold(), Is.EqualTo(gold));
            Assert.That(_merchants.Buyback(SmithId), Is.Empty);
            Assert.That(_env.Inventory.CountInBag(MerchantService.PlayerId, InventoryTestItems.Sword), Is.EqualTo(2));
        }

        [Test]
        public void Sell_RefusesLockedItems_AndWhenTheMerchantLacksGold()
        {
            ItemInstance sword = _env.AddToBag(InventoryTestItems.Sword, 6);
            _merchants.Restore(new MerchantsDto
            {
                Merchants = { [SmithId] = new MerchantDto { Gold = 0, Stock = { 2, 5 } } }
            });

            Assert.That(_merchants.TrySell(SmithId, sword.InstanceId, 1, out string reason), Is.False);
            Assert.That(reason, Does.StartWith("Der Händler hat nicht genug Gold"));
            Assert.That(_merchants.TrySell(SmithId, "unknown", 1, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("Gegenstand nicht im Rucksack."));
        }

        [Test]
        public void Restock_AfterThreeGameDays_RefillsStock_AndClearsBuyback()
        {
            MerchantOffer potion = _merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Potion);
            Assert.That(_merchants.TryBuy(SmithId, potion.Index, 5, out string reason), Is.True, reason);
            ItemInstance sword = _env.AddToBag(InventoryTestItems.Sword, 6);
            Assert.That(_merchants.TrySell(SmithId, sword.InstanceId, 1, out reason), Is.True, reason);

            _clock.Seconds = 2.9 * MerchantService.DaySeconds;
            Assert.That(_merchants.Offers(SmithId).Any(o => o.ItemId == InventoryTestItems.Potion), Is.False, "not yet");

            _clock.Seconds = 3.0 * MerchantService.DaySeconds;
            Assert.That(_merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Potion).Count, Is.EqualTo(5));
            Assert.That(_merchants.Buyback(SmithId), Is.Empty);
        }

        [Test]
        public void Gold_RefillsByHalfItsMaximumPerGameDay()
        {
            _merchants.Restore(new MerchantsDto
            {
                Merchants = { [SmithId] = new MerchantDto { Gold = 0, Stock = { 2, 5 } } }
            });
            int max = _smith.MaxGold;

            _clock.Seconds = MerchantService.DaySeconds;
            Assert.That(_merchants.Gold(SmithId), Is.EqualTo(max / 2));
            _clock.Seconds = 2.5 * MerchantService.DaySeconds;
            Assert.That(_merchants.Gold(SmithId), Is.EqualTo(max));
        }

        [Test]
        public void SaveAndLoad_KeepGoldStockDemandAndBuyback()
        {
            ItemInstance sword = _env.AddToBag(InventoryTestItems.Sword, 6);
            Assert.That(_merchants.TrySell(SmithId, sword.InstanceId, 1, out string reason), Is.True, reason);
            MerchantOffer potion = _merchants.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Potion);
            Assert.That(_merchants.TryBuy(SmithId, potion.Index, 2, out reason), Is.True, reason);
            MerchantsDto saved = _merchants.Capture();

            var loaded = new MerchantService(_env.Inventory, _clock, () => 4, new[] { _smith }, 7UL);
            loaded.Restore(saved);

            Assert.That(loaded.Gold(SmithId), Is.EqualTo(_merchants.Gold(SmithId)));
            Assert.That(loaded.Offers(SmithId).First(o => o.ItemId == InventoryTestItems.Potion).Count, Is.EqualTo(3));
            Assert.That(loaded.Buyback(SmithId).Count, Is.EqualTo(1));
            Assert.That(loaded.Buyback(SmithId)[0].Item.InstanceId, Is.EqualTo(sword.InstanceId));
            Assert.That(loaded.SellPrice(SmithId, _env.AddToBag(InventoryTestItems.Sword, 6)), Is.EqualTo(_merchants.SellPrice(SmithId, sword)));
        }

        [Test]
        public void SaveData_FollowsTheDtoRulesOfTheSaveSystem()
        {
            // The save manager refuses DTOs with properties at boot (a refused saveable stops the whole boot).
            Assert.That(Aetherfall.SaveSystem.SaveDtoValidator.Validate(typeof(MerchantsDto), out string problem), Is.True, problem);
        }

        [Test]
        public void Npc_FindsItsMerchant()
        {
            Assert.That(_merchants.TryGetForNpc("npc.test.tobold", out MerchantDefinition merchant), Is.True);
            Assert.That(merchant, Is.SameAs(_smith));
            Assert.That(_merchants.TryGetForNpc("npc.test.niemand", out _), Is.False);
        }

        private int Gold()
        {
            return _env.Inventory.GetCurrency(MerchantService.PlayerId, CurrencyIds.Gold);
        }

        private static MerchantDefinition CreateMerchant(string id, string npcId, MerchantKind kind, int goldBase, params MerchantStockEntry[] stock)
        {
            var merchant = ScriptableObject.CreateInstance<MerchantDefinition>();
            merchant.EditorSetUp(npcId, id, kind, goldBase, 5, stock, new string[0], new string[0]);
            var serialized = new SerializedObject(merchant);
            serialized.FindProperty("id").stringValue = id;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return merchant;
        }

        private sealed class FakeClock : IPlaytimeClock
        {
            public double Seconds { get; set; }

            public double PlaytimeSeconds => Seconds;

            public bool IsRunning => true;
        }
    }
}
