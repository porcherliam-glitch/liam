using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// The inventory conditions and actions of architecture 7.7 (HasItem, CurrencyAtLeast, GiveItem, RemoveItem, GiveCurrency,
    /// RemoveCurrency): evaluation against the inventory service, triggers, events with the quest as source, failures without
    /// change, validation and the rules for concrete types (7.6).
    /// </summary>
    [TestFixture]
    public sealed class InventoryConditionTests
    {
        private const string Source = "quest.side.test.wolfsjagd";

        private InventoryTestEnvironment _env;
        private ServiceLocator _services;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment(false);
            _services = new ServiceLocator();
            _services.Register<IInventoryService>(_env.Inventory);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        private ConditionContext ConditionCtx => ConditionContext.ForPlayer(_services, Source);

        private ActionContext ActionCtx => ActionContext.ForPlayer(_services, Source);

        [Test]
        public void HasItem_CountsTheOwnedPieces()
        {
            var condition = new HasItem(InventoryTestItems.WolfFur, 2);
            Assert.That(condition.Evaluate(ConditionCtx), Is.False);

            new GiveItem(InventoryTestItems.WolfFur, 1).Execute(ActionCtx);
            Assert.That(condition.Evaluate(ConditionCtx), Is.False);

            new GiveItem(InventoryTestItems.WolfFur, 1).Execute(ActionCtx);
            Assert.That(condition.Evaluate(ConditionCtx), Is.True);
            Assert.That(TriggerSet.Of(condition).Contains<InventoryChanged>(), Is.True);
        }

        [Test]
        public void HasItem_BagOnlyIgnoresEquipment()
        {
            ItemInstance sword = _env.AddToBag(InventoryTestItems.Sword);
            Assert.That(_env.Inventory.TryEquip(sword.InstanceId, EquipmentSlot.None, out string reason), Is.True, reason);

            Assert.That(new HasItem(InventoryTestItems.Sword).Evaluate(ConditionCtx), Is.True);
            Assert.That(new HasItem(InventoryTestItems.Sword, 1, true).Evaluate(ConditionCtx), Is.False);
        }

        [Test]
        public void GiveItem_SendsPickupWithTheQuestAsSource()
        {
            using (var picked = new EventRecorder<ItemPickedUp>(_env.Bus))
            {
                new GiveItem(InventoryTestItems.Potion, 2).Execute(ActionCtx);

                Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.Potion), Is.EqualTo(2));
                Assert.That(picked.Count, Is.EqualTo(1));
                Assert.That(picked.Last.SourceId, Is.EqualTo(Source));
                Assert.That(picked.Last.Amount, Is.EqualTo(2));
            }
        }

        [Test]
        public void GiveItem_UnknownItemOnlyWarns()
        {
            new GiveItem("item.misc.gibt_es_nicht", 1).Execute(ActionCtx);

            Assert.That(_env.LogCapture.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
        }

        [Test]
        public void RemoveItem_TakesFromTheBagOrNothing()
        {
            new GiveItem(InventoryTestItems.WolfFur, 3).Execute(ActionCtx);

            new RemoveItem(InventoryTestItems.WolfFur, 2).Execute(ActionCtx);
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(1));

            new RemoveItem(InventoryTestItems.WolfFur, 5).Execute(ActionCtx);
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, InventoryTestItems.WolfFur), Is.EqualTo(1), "too few: nothing taken");
            Assert.That(_env.LogCapture.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
        }

        [Test]
        public void Currency_GiveCheckAndRemove()
        {
            var richEnough = new CurrencyAtLeast(CurrencyIds.Gold, 50);
            using (var changed = new EventRecorder<CurrencyChanged>(_env.Bus))
            {
                new GiveCurrency(60).Execute(ActionCtx);
                Assert.That(richEnough.Evaluate(ConditionCtx), Is.True);
                Assert.That(changed.Last.Delta, Is.EqualTo(60));

                new RemoveCurrency(20).Execute(ActionCtx);
                Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(40));
                Assert.That(richEnough.Evaluate(ConditionCtx), Is.False);

                new RemoveCurrency(100).Execute(ActionCtx);
                Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(40), "never below 0");
                Assert.That(_env.LogCapture.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
            }

            Assert.That(TriggerSet.Of(richEnough).Contains<CurrencyChanged>(), Is.True);
        }

        [Test]
        public void Validation_FindsEmptyAndWrongIds()
        {
            var report = new ValidationReport();
            new HasItem(string.Empty).Validate(report);
            new GiveItem("item.potion.heiltrank_schwach", 0).Validate(report);
            new RemoveItem(string.Empty).Validate(report);
            new GiveCurrency(5, "gold").Validate(report);
            new RemoveCurrency(0).Validate(report);
            Assert.That(report.ErrorCount, Is.EqualTo(5), report.ToText());

            var valid = new ValidationReport();
            new HasItem(InventoryTestItems.WolfFur).Validate(valid);
            new GiveItem(InventoryTestItems.Potion, 2).Validate(valid);
            new RemoveItem(InventoryTestItems.WolfFur).Validate(valid);
            new GiveCurrency(50).Validate(valid);
            new RemoveCurrency(10, CurrencyIds.AetherShards).Validate(valid);
            new CurrencyAtLeast(CurrencyIds.Gold, 10).Validate(valid);
            Assert.That(valid.ErrorCount + valid.WarningCount, Is.EqualTo(0), valid.ToText());
            Assert.That(valid.References.Count, Is.EqualTo(3), "item ids are recorded, currency ids are not (no definitions yet)");
        }

        [Test]
        public void Types_FollowTheRulesOfArchitecture76()
        {
            AssertType(typeof(HasItem), "Inventar/Besitzt Item");
            AssertType(typeof(CurrencyAtLeast), "Inventar/Währung mindestens");
            AssertType(typeof(GiveItem), "Inventar/Item geben");
            AssertType(typeof(RemoveItem), "Inventar/Item entfernen");
            AssertType(typeof(GiveCurrency), "Inventar/Währung geben");
            AssertType(typeof(RemoveCurrency), "Inventar/Währung entfernen");
        }

        private static void AssertType(System.Type type, string menu)
        {
            Assert.That(type.IsSealed && System.Attribute.IsDefined(type, typeof(System.SerializableAttribute), false), Is.True, type.Name);
            Assert.That(type.GetConstructor(System.Type.EmptyTypes), Is.Not.Null, type.Name);
            var attribute = (TypeMenuAttribute)System.Attribute.GetCustomAttribute(type, typeof(TypeMenuAttribute));
            Assert.That(attribute, Is.Not.Null, type.Name);
            Assert.That(attribute.Path, Is.EqualTo(menu));
        }
    }
}
