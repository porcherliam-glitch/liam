using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Progression;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// Condition "Spieler hat Level X" and the actions "Erfahrung geben" and "Skillpunkt geben" (architecture 7.7): evaluation,
    /// triggers (LevelUp), the condition watcher, fixed and level share rewards with the quest as source, and validation.
    /// </summary>
    [TestFixture]
    public sealed class ProgressionConditionTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private ProgressionService _service;
        private ServiceLocator _services;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _service = new ProgressionService(_bus);
            _services = new ServiceLocator();
            _services.Register<IProgressionService>(_service);
        }

        [TearDown]
        public void TearDown()
        {
            _service.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void PlayerLevelAtLeast_ComparesWithTheCurrentLevel()
        {
            var condition = new PlayerLevelAtLeast(2);
            ConditionContext ctx = ConditionContext.ForPlayer(_services, "quest.side.test.x");

            Assert.That(condition.Evaluate(ctx), Is.False);
            _service.AddXp(200, "test");
            Assert.That(condition.Evaluate(ctx), Is.True);
            Assert.That(new PlayerLevelAtLeast(1).Evaluate(ctx), Is.True);
            Assert.That(condition.Describe(), Does.Contain("2"));
        }

        [Test]
        public void PlayerLevelAtLeast_IsTriggeredByLevelUp()
        {
            TriggerSet triggers = TriggerSet.Of(new PlayerLevelAtLeast(3));

            Assert.That(triggers.Contains<LevelUp>(), Is.True);
            Assert.That(triggers.IsPolled, Is.False);
        }

        [Test]
        public void Watcher_ReportsTheLevelUp()
        {
            var watcher = new ConditionWatcher(_bus);
            bool? last = null;
            int watch = watcher.Watch(new PlayerLevelAtLeast(2), ConditionContext.ForPlayer(_services, "test"), value => last = value);
            watcher.EvaluatePending();
            Assert.That(watcher.IsMet(watch), Is.False);

            _service.AddXp(250, "test");
            watcher.EvaluatePending();

            Assert.That(watcher.IsMet(watch), Is.True);
            Assert.That(last, Is.True);
            watcher.Dispose();
        }

        [Test]
        public void GiveXp_Fixed_UsesTheSourceOfTheContext()
        {
            using (var recorder = new EventRecorder<XpGained>(_bus))
            {
                new GiveXp(120).Execute(ActionContext.ForPlayer(_services, "quest.side.test.wolfsjagd"));

                Assert.That(_service.TotalXp, Is.EqualTo(120));
                Assert.That(recorder.Last.SourceId, Is.EqualTo("quest.side.test.wolfsjagd"));
            }
        }

        [Test]
        public void GiveXp_LevelShare_ConvertsWithTheCurve()
        {
            new GiveXp(0.5f, 2).Execute(ActionContext.ForPlayer(_services, "quest.a"));

            Assert.That(_service.TotalXp, Is.EqualTo(200), "0.5 × XP_next(2) = 0.5 × 400");
            Assert.That(new GiveXp(0.5f, 2).Describe(), Is.EqualTo("Erfahrung 0,5 Lv (bei Level 2)"));
            Assert.That(new GiveXp(50).Describe(), Is.EqualTo("Erfahrung +50"));
        }

        [Test]
        public void GiveXp_Validation()
        {
            var report = new ValidationReport();
            new GiveXp(0).Validate(report);
            new GiveXp(0f, 3).Validate(report);
            new GiveXp(3f, 3).Validate(report);
            Assert.That(report.ErrorCount, Is.EqualTo(3));

            var valid = new ValidationReport();
            new GiveXp(10).Validate(valid);
            new GiveXp(0.4f, 0).Validate(valid);
            new GiveSkillPoints(1).Validate(valid);
            new PlayerLevelAtLeast(5).Validate(valid);
            Assert.That(valid.ErrorCount, Is.EqualTo(0), valid.ToText());
        }

        [Test]
        public void GiveSkillPoints_AddsBonusPoints()
        {
            new GiveSkillPoints(2).Execute(ActionContext.ForPlayer(_services, "quest.puzzle.x"));

            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(2));
            Assert.That(_service.BonusSkillPoints, Is.EqualTo(2));
        }

        [Test]
        public void Types_FollowTheRulesOfArchitecture76()
        {
            AssertSerializableSealedWithMenu(typeof(PlayerLevelAtLeast), "Spieler/Level mindestens");
            AssertSerializableSealedWithMenu(typeof(GiveXp), "Spieler/Erfahrung geben");
            AssertSerializableSealedWithMenu(typeof(GiveSkillPoints), "Spieler/Skillpunkt geben");
        }

        private static void AssertSerializableSealedWithMenu(System.Type type, string menu)
        {
            Assert.That(type.IsSealed, Is.True, type.Name);
            Assert.That(System.Attribute.IsDefined(type, typeof(System.SerializableAttribute), false), Is.True, type.Name);
            Assert.That(type.GetConstructor(System.Type.EmptyTypes), Is.Not.Null, type.Name);
            var attribute = (TypeMenuAttribute)System.Attribute.GetCustomAttribute(type, typeof(TypeMenuAttribute));
            Assert.That(attribute, Is.Not.Null, type.Name);
            Assert.That(attribute.Path, Is.EqualTo(menu));
        }
    }
}
