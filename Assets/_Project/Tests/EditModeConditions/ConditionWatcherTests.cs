using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>
    /// Event-driven re-evaluation (architecture 7.5): the watcher subscribes each event type once, re-evaluates only watches
    /// that declared the published event (flags filtered by id, game time by hour), polls watches without triggers once per
    /// second, calls back only on changes, survives throwing conditions and callbacks, and releases everything on dispose.
    /// </summary>
    [TestFixture]
    public sealed class ConditionWatcherTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private SwitchBoard _board;
        private ConditionContext _ctx;
        private ConditionWatcher _watcher;
        private List<bool> _changes;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _board = new SwitchBoard();
            var services = new ServiceLocator();
            services.Register(_board);
            _ctx = ConditionContext.ForPlayer(services, "quest.test.watcher");
            _watcher = new ConditionWatcher(_bus);
            _changes = new List<bool>();
        }

        [TearDown]
        public void TearDown()
        {
            _watcher.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Watch_EvaluatesAtOnce_WithoutCallback()
        {
            _board.Set("a", true);
            int id = _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);

            Assert.That(id, Is.GreaterThan(0));
            Assert.That(_watcher.IsMet(id), Is.True);
            Assert.That(_watcher.IsWatching(id), Is.True);
            Assert.That(_changes, Is.Empty);
            Assert.That(_watcher.WatchCount, Is.EqualTo(1));
        }

        [Test]
        public void DeclaredEvent_MarksDirty_AndCallsBackOnChange()
        {
            int id = _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _board.Set("a", true);

            _watcher.Tick(0.016f);
            Assert.That(_changes, Is.Empty, "no event yet: the change is not noticed");

            _bus.Publish(new SwitchFlipped("a"));
            Assert.That(_watcher.PendingCount, Is.EqualTo(1));
            _watcher.Tick(0.016f);

            Assert.That(_changes, Is.EqualTo(new[] { true }));
            Assert.That(_watcher.IsMet(id), Is.True);
        }

        [Test]
        public void UnrelatedEvent_DoesNotEvaluate()
        {
            _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            int before = _board.Evaluations;

            _bus.Publish(new UnrelatedHappened(1));
            _watcher.EvaluatePending();

            Assert.That(_board.Evaluations, Is.EqualTo(before));
        }

        [Test]
        public void SameValue_NoCallback()
        {
            _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _bus.Publish(new SwitchFlipped("a"));
            _bus.Publish(new SwitchFlipped("a"));

            Assert.That(_watcher.PendingCount, Is.EqualTo(1), "a watch is queued only once");
            _watcher.EvaluatePending();
            Assert.That(_changes, Is.Empty);
        }

        [Test]
        public void EachEventType_IsSubscribedOnce()
        {
            for (int i = 0; i < 5; i++)
            {
                _watcher.Watch(new AllOf(new SwitchIsOn("a" + i), new SwitchIsOn("b" + i)), _ctx, null);
            }

            Assert.That(_bus.GetSubscriberCount<SwitchFlipped>(), Is.EqualTo(1));
            Assert.That(_watcher.SubscribedEventTypeCount, Is.EqualTo(1));
        }

        [Test]
        public void FlagTrigger_IsFilteredById()
        {
            _watcher.Watch(new FlagSwitch("flag.test.a"), _ctx, _changes.Add);
            _watcher.Watch(new FlagSwitch("flag.test.b"), _ctx, null);
            _board.Evaluations = 0;
            _board.Set("flag.test.a", true);

            _bus.Publish(new FlagChanged("flag.test.a", 0, 1));
            _watcher.EvaluatePending();

            Assert.That(_board.Evaluations, Is.EqualTo(1), "only the watch of flag a");
            Assert.That(_changes, Is.EqualTo(new[] { true }));
            Assert.That(_bus.GetSubscriberCount<FlagChanged>(), Is.EqualTo(1));
        }

        [Test]
        public void HourTrigger_OnlyWhenTheHourChanges()
        {
            _watcher.Watch(new HourSwitch("nacht"), _ctx, _changes.Add);
            _board.Evaluations = 0;

            _bus.Publish(new TimeOfDayChanged(0, 6, 0, DayPhase.Morning));
            _watcher.EvaluatePending();
            _bus.Publish(new TimeOfDayChanged(0, 6, 1, DayPhase.Morning));
            _watcher.EvaluatePending();
            Assert.That(_board.Evaluations, Is.EqualTo(1), "minute 6:01 is the same hour");

            _board.Set("nacht", true);
            _bus.Publish(new TimeOfDayChanged(0, 7, 0, DayPhase.Day));
            _watcher.EvaluatePending();
            Assert.That(_board.Evaluations, Is.EqualTo(2));
            Assert.That(_changes, Is.EqualTo(new[] { true }));
        }

        [Test]
        public void WatchWithoutTriggers_IsPolledEverySecond()
        {
            _watcher.Watch(new PolledSwitch("a"), _ctx, _changes.Add);
            _board.Set("a", true);

            _watcher.Tick(0.5f);
            Assert.That(_changes, Is.Empty);
            _watcher.Tick(0.6f);
            Assert.That(_changes, Is.EqualTo(new[] { true }));
        }

        [Test]
        public void ConstantAndNullConditions_AreNeitherPolledNorSubscribed()
        {
            int always = _watcher.Watch(new Always(), _ctx, _changes.Add);
            int none = _watcher.Watch(null, _ctx, _changes.Add);

            _watcher.Tick(5f);
            Assert.That(_watcher.PendingCount, Is.EqualTo(0));
            Assert.That(_watcher.IsMet(always), Is.True);
            Assert.That(_watcher.IsMet(none), Is.True, "no condition holds");
            Assert.That(_watcher.SubscribedEventTypeCount, Is.EqualTo(0));
        }

        [Test]
        public void Unwatch_StopsCallbacks()
        {
            int id = _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _watcher.Unwatch(id);
            _board.Set("a", true);
            _bus.Publish(new SwitchFlipped("a"));
            _watcher.EvaluatePending();

            Assert.That(_changes, Is.Empty);
            Assert.That(_watcher.IsWatching(id), Is.False);
            Assert.That(_watcher.IsMet(id), Is.False);
            _watcher.Unwatch(id);
            _watcher.Unwatch(12345);
        }

        [Test]
        public void ThrowingCondition_CountsAsFalse_AndThrowingCallback_DoesNotStopOthers()
        {
            _watcher.Watch(new ThrowingCondition(), _ctx, _changes.Add);
            _watcher.Watch(new SwitchIsOn("a"), _ctx, value => throw new System.InvalidOperationException("callback"));
            _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _board.Set("a", true);

            _bus.Publish(new SwitchFlipped("a"));
            _watcher.EvaluatePending();

            Assert.That(_changes, Is.EqualTo(new[] { true }), "the third watch still gets its callback");
            Assert.That(_log.Sink.ErrorCount, Is.GreaterThanOrEqualTo(2));
        }

        [Test]
        public void MarkAllDirty_ReevaluatesEverything()
        {
            _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _watcher.Watch(new PolledSwitch("b"), _ctx, _changes.Add);
            _board.Set("a", true);
            _board.Set("b", true);

            _watcher.MarkAllDirty();
            Assert.That(_watcher.PendingCount, Is.EqualTo(2));
            Assert.That(_watcher.EvaluatePending(), Is.EqualTo(2));
            Assert.That(_changes, Is.EqualTo(new[] { true, true }));
        }

        [Test]
        public void Tick_EvaluatesAtLeastOneWatch_EvenWithTinyBudget()
        {
            var watcher = new ConditionWatcher(_bus, 1f, 0.000001);
            for (int i = 0; i < 50; i++)
            {
                watcher.Watch(new SwitchIsOn("a"), _ctx, null);
            }

            _bus.Publish(new SwitchFlipped("a"));
            Assert.That(watcher.PendingCount, Is.EqualTo(50));
            watcher.Tick(0.016f);
            Assert.That(watcher.PendingCount, Is.LessThan(50));
            watcher.EvaluatePending();
            Assert.That(watcher.PendingCount, Is.EqualTo(0));
            watcher.Dispose();
        }

        [Test]
        public void CallbackThatChangesState_IsSeenOnTheNextEvent()
        {
            int second = 0;
            _watcher.Watch(new SwitchIsOn("a"), _ctx, value =>
            {
                _board.Set("b", value);
                _bus.Publish(new SwitchFlipped("b"));
            });
            _watcher.Watch(new SwitchIsOn("b"), _ctx, value => second++);
            _board.Set("a", true);

            _bus.Publish(new SwitchFlipped("a"));
            _watcher.EvaluatePending();

            Assert.That(second, Is.EqualTo(1), "the chained change is evaluated in the same pass");
        }

        [Test]
        public void Dispose_UnsubscribesEverything()
        {
            _watcher.Watch(new SwitchIsOn("a"), _ctx, _changes.Add);
            _watcher.Watch(new FlagSwitch("flag.test.a"), _ctx, _changes.Add);
            _watcher.Watch(new HourSwitch("h"), _ctx, _changes.Add);

            _watcher.Dispose();

            Assert.That(_bus.GetSubscriberCount<SwitchFlipped>(), Is.EqualTo(0));
            Assert.That(_bus.GetSubscriberCount<FlagChanged>(), Is.EqualTo(0));
            Assert.That(_bus.GetSubscriberCount<TimeOfDayChanged>(), Is.EqualTo(0));
            Assert.That(_watcher.WatchCount, Is.EqualTo(0));
            Assert.Throws<System.ObjectDisposedException>(() => _watcher.Watch(new Always(), _ctx, null));
        }

        [Test]
        public void TriggerSet_CollectsNestedTriggers()
        {
            TriggerSet set = TriggerSet.Of(new AllOf(new SwitchIsOn("a"), new Not(new FlagSwitch("flag.test.x")), new AnyOf(new HourSwitch("h"))));

            Assert.That(set.Contains<SwitchFlipped>(), Is.True);
            Assert.That(set.FlagIds, Is.EqualTo(new[] { "flag.test.x" }));
            Assert.That(set.Hourly, Is.True);
            Assert.That(set.IsEmpty, Is.False);
            Assert.That(TriggerSet.Of(new PolledSwitch("p")).IsEmpty, Is.True);
            Assert.That(TriggerSet.Of(new Always()).IsConstant, Is.True);
            Assert.That(TriggerSet.Of(null).IsEmpty, Is.True);
        }
    }
}
