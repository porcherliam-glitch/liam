using Aetherfall.Core;
using Aetherfall.Progression;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The save section <c>progression</c> (architecture 9.2, load order 40): round trip through the JSON serializer of the
    /// save system, attributes by name, new game, damaged entries and the level in the save header.
    /// </summary>
    [TestFixture]
    public sealed class ProgressionSaveableTests
    {
        private static readonly LoadContext Loaded = new LoadContext("char_test/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private LogCapture _log;
        private EventBus _bus;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void KeyAndOrder_FollowTable92()
        {
            var saveable = new ProgressionSaveable(new ProgressionService(_bus));

            Assert.That(saveable.SaveKey, Is.EqualTo("progression"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(40));
            Assert.That(saveable.DataType, Is.EqualTo(typeof(ProgressionDto)));
        }

        [Test]
        public void SaveAndLoad_RestoresLevelExperienceAndPoints()
        {
            var source = new ProgressionService(_bus);
            source.AddXp(1000, "test");
            source.AddSkillPoints(1, "quest.puzzle.x");
            source.TrySpendAttributePoint(StatId.Strength);
            var serializer = new NewtonsoftJsonSerializer();
            string json = serializer.Serialize(new ProgressionSaveable(source).Save(), false);

            var target = new ProgressionService(_bus);
            var stats = new StatCollection();
            target.AttachPlayerStats(stats);
            var saveable = new ProgressionSaveable(target);
            saveable.Load(serializer.Deserialize(json, saveable.DataType), Loaded);

            Assert.That(json, Does.Contain("Strength"), "attributes are saved by name");
            Assert.That(target.Level, Is.EqualTo(3));
            Assert.That(target.XpIntoLevel, Is.EqualTo(400));
            Assert.That(target.UnspentAttributePoints, Is.EqualTo(1));
            Assert.That(target.UnspentSkillPoints, Is.EqualTo(3));
            Assert.That(target.BonusSkillPoints, Is.EqualTo(1));
            Assert.That(target.GetSpentPoints(StatId.Strength), Is.EqualTo(1));
            Assert.That(target.GetRefundablePoints(StatId.Strength), Is.EqualTo(0), "loaded points are final");
            Assert.That(stats.Get(StatId.Level), Is.EqualTo(3f));
        }

        [Test]
        public void NewGame_StartsAtLevelOne()
        {
            var service = new ProgressionService(_bus);
            service.AddXp(5000, "test");

            new ProgressionSaveable(service).Load(null, LoadContext.NewGame);

            Assert.That(service.Level, Is.EqualTo(1));
            Assert.That(service.TotalXp, Is.EqualTo(0));
        }

        [Test]
        public void UnknownAttribute_IsIgnoredWithAWarning()
        {
            var service = new ProgressionService(_bus);
            var dto = new ProgressionDto { Level = 2 };
            dto.Attributes.Add(new AttributePointsDto { Attribute = "Glueck", Points = 4 });
            dto.Attributes.Add(new AttributePointsDto { Attribute = "Armor", Points = 2 });
            dto.Attributes.Add(new AttributePointsDto { Attribute = "Wisdom", Points = 1 });
            dto.Attributes.Add(null);

            new ProgressionSaveable(service).Load(dto, Loaded);

            Assert.That(service.Level, Is.EqualTo(2));
            Assert.That(service.GetSpentPoints(StatId.Wisdom), Is.EqualTo(1));
            Assert.That(_log.Sink.Count(LogLevel.Warning), Is.EqualTo(2));
        }

        [Test]
        public void Header_GetsTheLevel()
        {
            var service = new ProgressionService(_bus);
            service.AddXp(600, "test");
            var header = new SaveHeader();

            new ProgressionSaveable(service).Contribute(header);

            Assert.That(header.Character.Level, Is.EqualTo(3));
        }
    }
}
