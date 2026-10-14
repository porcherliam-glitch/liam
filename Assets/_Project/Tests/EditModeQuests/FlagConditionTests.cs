using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Conditions and actions of the world state (architecture 7.7): <c>FlagIs</c> with all comparisons, <c>FlagAge</c> for
    /// delayed consequences, <c>SetFlag</c> and <c>AddToFlag</c> with the source in the write log, and the event-driven
    /// re-evaluation through the condition watcher (only <c>FlagChanged</c> of the watched id; time conditions are polled
    /// while no game clock runs).
    /// </summary>
    [TestFixture]
    public sealed class FlagConditionTests
    {
        private const string Spared = "flag.eichental.harrik_verschont";
        private const string Status = "flag.eichental.harrik_status";
        private const string Bandits = "stat.global.banditen_getoetet";

        private LogCapture _log;
        private EventBus _bus;
        private FakePlaytimeClock _clock;
        private WorldStateService _world;
        private ServiceLocator _services;
        private ConditionContext _ctx;
        private ActionContext _actionCtx;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _clock = new FakePlaytimeClock();
            FlagRegistry flags = FlagRegistry.FromSpecs(FlagSpec.Bool(Spared), FlagSpec.Enum(Status, "frei", "tot", "in Haft"), FlagSpec.Counter(Bandits));
            _world = new WorldStateService(_bus, flags, _clock);
            _services = new ServiceLocator();
            _services.Register<IWorldState>(_world);
            _ctx = ConditionContext.ForPlayer(_services, "quest.main.schatten_ueber_aurelion");
            _actionCtx = ActionContext.ForPlayer(_services, "quest.side.eichental.banditen_am_muehlbach");
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [TestCase(FlagComparison.Equal, 25, true)]
        [TestCase(FlagComparison.Equal, 24, false)]
        [TestCase(FlagComparison.NotEqual, 24, true)]
        [TestCase(FlagComparison.Greater, 24, true)]
        [TestCase(FlagComparison.Greater, 25, false)]
        [TestCase(FlagComparison.GreaterOrEqual, 25, true)]
        [TestCase(FlagComparison.Less, 26, true)]
        [TestCase(FlagComparison.LessOrEqual, 24, false)]
        public void FlagIs_ComparesTheValue(FlagComparison comparison, int value, bool expected)
        {
            _world.Add(Bandits, 25, "test");

            Assert.That(new FlagIs(Bandits, comparison, value).Evaluate(_ctx), Is.EqualTo(expected));
        }

        [Test]
        public void FlagIs_Describe_ShowsIdOperatorAndValue()
        {
            Assert.That(new FlagIs(Bandits, FlagComparison.GreaterOrEqual, 25).Describe(), Is.EqualTo("Flag " + Bandits + " ≥ 25"));
        }

        [Test]
        public void SetFlag_AndAddToFlag_WriteWithTheSourceOfTheContext()
        {
            new SetFlag(Status, 2).Execute(_actionCtx);
            new AddToFlag(Bandits, 3).Execute(_actionCtx);
            new AddToFlag(Bandits, -1).Execute(_actionCtx);

            Assert.That(_world.GetInt(Status), Is.EqualTo(2));
            Assert.That(_world.GetInt(Bandits), Is.EqualTo(2));
            Assert.That(_world.GetFlagsWrittenBy("quest.side.eichental.banditen_am_muehlbach"), Is.EqualTo(new[] { Status, Bandits }));
        }

        [Test]
        public void FlagAge_HoldsOnlyAfterTheMinimumPlaytime()
        {
            var condition = new FlagAge(Spared, 15f);
            Assert.That(condition.Evaluate(_ctx), Is.False, "flag not set");

            _clock.PlaytimeSeconds = 5400.0;
            _world.SetBool(Spared, true, "quest.side.eichental.banditen_am_muehlbach");
            _clock.AdvanceHours(14.9);
            Assert.That(condition.Evaluate(_ctx), Is.False);

            _clock.AdvanceHours(0.2);
            Assert.That(condition.Evaluate(_ctx), Is.True);
        }

        [Test]
        public void Watcher_ReEvaluatesFlagIs_OnlyOnItsOwnFlag()
        {
            using (var watcher = new ConditionWatcher(_bus))
            {
                var changes = new List<bool>();
                int id = watcher.Watch(new FlagIs(Spared, 1), _ctx, changes.Add);

                _world.Add(Bandits, 1, "test");
                Assert.That(watcher.PendingCount, Is.EqualTo(0), "other flag: not dirty");

                _world.SetBool(Spared, true, "test");
                Assert.That(watcher.PendingCount, Is.EqualTo(1));
                watcher.Tick(0.016f);

                Assert.That(changes, Is.EqualTo(new[] { true }));
                Assert.That(watcher.IsMet(id), Is.True);
            }
        }

        [Test]
        public void Watcher_PollsFlagAge_UntilTheGameClockRuns_ThenOnlyEveryHour()
        {
            using (var watcher = new ConditionWatcher(_bus))
            {
                var changes = new List<bool>();
                _world.SetBool(Spared, true, "test");
                watcher.Watch(new FlagAge(Spared, 15f), _ctx, changes.Add);
                Assert.That(watcher.HasGameClock, Is.False);

                _clock.AdvanceHours(16.0);
                watcher.Tick(1.1f);
                Assert.That(changes, Is.EqualTo(new[] { true }), "no game clock yet: polled every second");

                _world.SetBool(Spared, false, "test");
                _world.SetBool(Spared, true, "test");
                watcher.Tick(0.016f);
                Assert.That(changes, Is.EqualTo(new[] { true, false }), "FlagChanged of its flag");

                _bus.Publish(new TimeOfDayChanged(0, 8, 0, DayPhase.Morning));
                Assert.That(watcher.HasGameClock, Is.True);
                watcher.EvaluatePending();
                _clock.AdvanceHours(16.0);
                watcher.Tick(1.1f);
                Assert.That(changes, Is.EqualTo(new[] { true, false }), "with a game clock: no polling any more");

                _bus.Publish(new TimeOfDayChanged(0, 9, 0, DayPhase.Day));
                watcher.EvaluatePending();
                Assert.That(changes, Is.EqualTo(new[] { true, false, true }), "re-checked at the new game hour");
            }
        }

        [Test]
        public void Validate_EmptyIdIsAnError_AndReferencesAreRecorded()
        {
            var report = new ValidationReport();
            new FlagIs(string.Empty, 1).Validate(report);
            new SetFlag(Status, 2).Validate(report);
            new FlagAge(Spared, 3f).Validate(report);

            Assert.That(report.CountOf(ValidationReportExtensions.InvalidParameterCode), Is.EqualTo(1));
            Assert.That(report.References.Count, Is.EqualTo(2));
            Assert.That(report.References[0].Use, Is.EqualTo(ReferenceUse.Write));
            Assert.That(report.References[0].Value, Is.EqualTo(2));
            Assert.That(report.References[1].Use, Is.EqualTo(ReferenceUse.Read));
        }

        [Test]
        public void FlagSpec_ParsesAndFormatsValues()
        {
            FlagSpec status = FlagSpec.Enum(Status, "frei", "tot", "in Haft");

            Assert.That(status.TryParseValue("in haft", out int value), Is.True);
            Assert.That(value, Is.EqualTo(2));
            Assert.That(status.FormatValue(1), Is.EqualTo("1 (tot)"));
            Assert.That(status.IsKnownValue(3), Is.False);
            Assert.That(FlagSpec.Bool(Spared).FormatValue(1), Is.EqualTo("wahr"));
            Assert.That(FlagSpec.TryParseCommon("nein", out value), Is.True);
            Assert.That(value, Is.EqualTo(0));
            Assert.That(FlagSpec.StoryNumber("stat.player.leere_resonanz", 0, 100, 0).Normalize(120), Is.EqualTo(100));
        }
    }
}
