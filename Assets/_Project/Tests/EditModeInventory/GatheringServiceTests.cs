using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Crafting;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>Gathering from harvest nodes (S30, GDD 04 6.10): the yield 1–3 goes into the player's bag and is reported.</summary>
    [TestFixture]
    public sealed class GatheringServiceTests
    {
        private const string Bloodroot = "item.herb.blutwurz";
        private const string Node = "obj.eichental.kraut_blutwurz_1";

        private LogCapture _log;
        private EventBus _bus;
        private InventoryService _inventory;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            ItemCatalog catalog = InventoryTestItems.CreateCatalog();
            Assert.That(catalog.AddItem(new ItemSpec
            {
                Id = Bloodroot, DisplayName = "Blutwurz", Category = ItemCategory.Material, EquipKind = EquipKind.None, StackSize = 99, Weight = 0.05f,
                Value = 2f
            }), Is.Null.Or.Empty);
            _inventory = new InventoryService(_bus, catalog, 1UL, StartingKit.Empty);
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Harvest_GivesTheRolledAmountToThePlayer_AndReportsThePickup()
        {
            var service = new GatheringService(_inventory, new SequenceRandom(0.5f));
            using (var pickups = new EventRecorder<ItemPickedUp>(_bus))
            {
                int given = service.Harvest(Node, Bloodroot, 1, 3);

                Assert.That(given, Is.EqualTo(2), "1 + ⌊0.5 × 3⌋");
                Assert.That(_inventory.CountOf(InventoryOwners.Player, Bloodroot), Is.EqualTo(2));
                Assert.That(pickups.Count, Is.EqualTo(1));
                Assert.That(pickups.Last.ItemId, Is.EqualTo(Bloodroot));
                Assert.That(pickups.Last.Amount, Is.EqualTo(2));
                Assert.That(pickups.Last.SourceId, Is.EqualTo(Node));
            }
        }

        [Test]
        public void Yield_StaysInsideTheRange_AndHitsEveryValue()
        {
            var random = new Pcg32Random(42UL);
            var seen = new HashSet<int>();
            for (int i = 0; i < 200; i++)
            {
                int yield = GatheringRules.RollYield(1, 3, 0, random);
                Assert.That(yield, Is.InRange(1, 3));
                seen.Add(yield);
            }

            Assert.That(seen, Is.EquivalentTo(new[] { 1, 2, 3 }));
        }

        [TestCase(24, 0)]
        [TestCase(25, 1)]
        [TestCase(50, 2)]
        public void ProfessionLevel_AddsOnePiecePerTwentyFiveLevels(int level, int bonus)
        {
            Assert.That(GatheringRules.RollYield(1, 1, level, new SequenceRandom(0f)), Is.EqualTo(1 + bonus));
        }

        [Test]
        public void InvalidRange_IsClamped()
        {
            Assert.That(GatheringRules.RollYield(0, 0, 0, new SequenceRandom(0.9f)), Is.EqualTo(1));
            Assert.That(GatheringRules.RollYield(3, 1, 0, new SequenceRandom(0.9f)), Is.EqualTo(3));
        }

        [Test]
        public void UnknownItem_GivesNothing_AndWarns()
        {
            var service = new GatheringService(_inventory, new SequenceRandom(0.5f));

            Assert.That(service.Harvest(Node, "item.herb.gibt_es_nicht", 1, 3), Is.Zero);
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(1));
        }

        [Test]
        public void EmptyItem_GivesNothing()
        {
            var service = new GatheringService(_inventory, new SequenceRandom(0.5f));

            Assert.That(service.Harvest(Node, string.Empty, 1, 3), Is.Zero);
        }
    }
}
