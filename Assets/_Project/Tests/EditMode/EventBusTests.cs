using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="EventBus"/> (architecture 4.3). No Unity runtime calls.</summary>
    [TestFixture]
    public sealed class EventBusTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private List<string> _calls;
        private int _countA;
        private int _countB;
        private int _maxObservedDepth;
        private Action<TestEventA> _handlerToRemove;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _calls = new List<string>();
            _countA = 0;
            _countB = 0;
            _maxObservedDepth = 0;
            _handlerToRemove = null;
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Publish_DeliversEventWithPayload()
        {
            var recorder = new EventRecorder<TestEventA>(_bus);

            _bus.Publish(new TestEventA(42));

            Assert.That(recorder.Count, Is.EqualTo(1));
            Assert.That(recorder.Last.Value, Is.EqualTo(42));
        }

        [Test]
        public void Publish_WithoutSubscribers_DoesNothing()
        {
            Assert.DoesNotThrow(() => _bus.Publish(new TestEventA(1)));
            Assert.That(_log.Sink.Entries.Count, Is.EqualTo(0));
        }

        [Test]
        public void Publish_CallsHandlersInSubscriptionOrder()
        {
            _bus.Subscribe<TestEventA>(RecordFirst);
            _bus.Subscribe<TestEventA>(RecordSecond);
            _bus.Subscribe<TestEventA>(RecordThird);

            _bus.Publish(new TestEventA(1));

            Assert.That(_calls, Is.EqualTo(new[] { "first", "second", "third" }));
        }

        [Test]
        public void Publish_OnlyReachesHandlersOfThatEventType()
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Subscribe<TestEventB>(CountB);

            _bus.Publish(new TestEventB("b"));

            Assert.That(_countA, Is.EqualTo(0));
            Assert.That(_countB, Is.EqualTo(1));
        }

        [Test]
        public void Subscribe_NullHandler_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => _bus.Subscribe<TestEventA>(null));
        }

        [Test]
        public void Unsubscribe_StopsDelivery()
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Publish(new TestEventA(1));

            _bus.Unsubscribe<TestEventA>(CountA);
            _bus.Publish(new TestEventA(2));

            Assert.That(_countA, Is.EqualTo(1));
            Assert.That(_bus.GetSubscriberCount<TestEventA>(), Is.EqualTo(0));
        }

        [Test]
        public void Unsubscribe_UnknownHandler_IsIgnored()
        {
            _bus.Subscribe<TestEventA>(CountA);

            Assert.DoesNotThrow(() => _bus.Unsubscribe<TestEventA>(RecordFirst));
            Assert.DoesNotThrow(() => _bus.Unsubscribe<TestEventB>(CountB));

            _bus.Publish(new TestEventA(1));
            Assert.That(_countA, Is.EqualTo(1));
        }

        [Test]
        public void Unsubscribe_OfLaterHandlerDuringPublish_SkipsItImmediately()
        {
            _handlerToRemove = CountA;
            _bus.Subscribe<TestEventA>(RemoveConfiguredHandler);
            _bus.Subscribe<TestEventA>(CountA);

            _bus.Publish(new TestEventA(1));
            _bus.Publish(new TestEventA(2));

            Assert.That(_countA, Is.EqualTo(0), "A handler removed during a delivery must not receive the current or later events.");
            Assert.That(_bus.GetSubscriberCount<TestEventA>(), Is.EqualTo(1));
        }

        [Test]
        public void Unsubscribe_OfItselfDuringPublish_IsSafeAndOthersStillRun()
        {
            _bus.Subscribe<TestEventA>(RecordFirst);
            _bus.Subscribe<TestEventA>(UnsubscribeSelf);
            _bus.Subscribe<TestEventA>(RecordThird);

            _bus.Publish(new TestEventA(1));
            _bus.Publish(new TestEventA(2));

            Assert.That(_calls, Is.EqualTo(new[] { "first", "self", "third", "first", "third" }));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(0), _log.Sink.Dump());
        }

        [Test]
        public void Subscribe_DuringPublish_NewHandlerReceivesOnlyFollowingEvents()
        {
            _bus.Subscribe<TestEventA>(SubscribeCountAOnce);

            _bus.Publish(new TestEventA(1));
            Assert.That(_countA, Is.EqualTo(0), "A handler added during a delivery must not receive the current event.");

            _bus.Publish(new TestEventA(2));
            Assert.That(_countA, Is.EqualTo(1));
        }

        [Test]
        public void Subscribe_SameHandlerTwice_IsIgnoredWithWarning()
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Subscribe<TestEventA>(CountA); // a second, equal delegate (same target and method)

            _bus.Publish(new TestEventA(1));

            Assert.That(_countA, Is.EqualTo(1));
            Assert.That(_bus.GetSubscriberCount<TestEventA>(), Is.EqualTo(1));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "already subscribed"), Is.True, _log.Sink.Dump());

            _bus.Unsubscribe<TestEventA>(CountA);
            Assert.That(_bus.GetSubscriberCount<TestEventA>(), Is.EqualTo(0), "One Unsubscribe removes the single subscription.");
        }

        [Test]
        public void Subscribe_SameMethodOnDifferentTargets_AreDistinctHandlers()
        {
            var first = new CountingTarget();
            var second = new CountingTarget();
            _bus.Subscribe<TestEventA>(first.OnEvent);
            _bus.Subscribe<TestEventA>(second.OnEvent);

            _bus.Publish(new TestEventA(1));

            Assert.That(first.Count, Is.EqualTo(1));
            Assert.That(second.Count, Is.EqualTo(1));
        }

        [Test]
        public void NestedPublish_UpToMaxDepth_IsDeliveredWithoutError()
        {
            _bus.Subscribe<TestEventA>(PublishNextUntilEight);

            _bus.Publish(new TestEventA(1));

            Assert.That(EventBus.MaxPublishDepth, Is.EqualTo(8));
            Assert.That(_countA, Is.EqualTo(8));
            Assert.That(_maxObservedDepth, Is.EqualTo(8));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(0), _log.Sink.Dump());
            Assert.That(_bus.PublishDepth, Is.EqualTo(0));
        }

        [Test]
        public void NestedPublish_AtDepthNine_IsRejectedAndLogged()
        {
            _bus.Subscribe<TestEventA>(PublishNextForever);

            _bus.Publish(new TestEventA(1));

            Assert.That(_countA, Is.EqualTo(EventBus.MaxPublishDepth), "Levels 1-8 are delivered, level 9 is rejected.");
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1), _log.Sink.Dump());
            Assert.That(_log.Sink.Contains(LogLevel.Error, "nesting depth"), Is.True);
            Assert.That(_log.Sink.Contains(LogLevel.Error, nameof(TestEventA)), Is.True);
            Assert.That(_bus.PublishDepth, Is.EqualTo(0));

            // The bus keeps working after the rejected delivery.
            _bus.Unsubscribe<TestEventA>(PublishNextForever);
            _bus.Subscribe<TestEventA>(CountA);
            _countA = 0;
            _bus.Publish(new TestEventA(1));
            Assert.That(_countA, Is.EqualTo(1));
        }

        [Test]
        public void HandlerException_IsLoggedAndRemainingHandlersRun()
        {
            _bus.Subscribe<TestEventA>(RecordFirst);
            _bus.Subscribe<TestEventA>(Throw);
            _bus.Subscribe<TestEventA>(RecordThird);

            Assert.DoesNotThrow(() => _bus.Publish(new TestEventA(1)));

            Assert.That(_calls, Is.EqualTo(new[] { "first", "third" }));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1), _log.Sink.Dump());
            CapturedLogEntry error = FindFirst(LogLevel.Error);
            Assert.That(error.Exception, Is.InstanceOf<InvalidOperationException>());
            Assert.That(error.Category, Is.EqualTo(LogCategory.Events));
            Assert.That(error.Message, Does.Contain(nameof(Throw)));
            Assert.That(_bus.PublishDepth, Is.EqualTo(0));
        }

        [Test]
        public void HandlerException_InNestedPublish_RestoresDepth()
        {
            _bus.Subscribe<TestEventA>(PublishB);
            _bus.Subscribe<TestEventB>(ThrowOnB);

            _bus.Publish(new TestEventA(1));
            _bus.Publish(new TestEventA(2));

            Assert.That(_countB, Is.EqualTo(2));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(2));
            Assert.That(_bus.PublishDepth, Is.EqualTo(0));
        }

        [Test]
        public void Publish_FromBackgroundThread_IsRejectedAndLogged()
        {
            _bus.Subscribe<TestEventA>(CountA);

            var thread = new Thread(PublishFromThread);
            thread.Start();
            thread.Join();

            Assert.That(_countA, Is.EqualTo(0));
            Assert.That(_log.Sink.Contains(LogLevel.Error, "background thread"), Is.True, _log.Sink.Dump());
        }

        [Test]
        public void Dispose_RemovesAllSubscriptions()
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Subscribe<TestEventB>(CountB);

            _bus.Dispose();
            _bus.Publish(new TestEventA(1));
            _bus.Publish(new TestEventB("b"));
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Publish(new TestEventA(2));

            Assert.That(_countA, Is.EqualTo(0));
            Assert.That(_countB, Is.EqualTo(0));
            Assert.That(_bus.GetSubscriberCount<TestEventA>(), Is.EqualTo(0));
            Assert.That(_log.Sink.Contains(LogLevel.Warning, "disposed"), Is.True);
        }

        [Test]
        public void Publish_AfterWarmUp_DoesNotAllocate()
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Subscribe<TestEventA>(RecordDepth);
            var evt = new TestEventA(7);

            // Warm-up: JIT compilation, dictionary comparer and other one-time allocations.
            PublishMany(evt, 32);

            if (AllocationCounterWorks())
            {
                long before = GC.GetAllocatedBytesForCurrentThread();
                PublishMany(evt, 1000);
                long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

                Assert.That(allocated, Is.EqualTo(0L), "Publish must not allocate (architecture 4.3).");
                Assert.That(_countA, Is.EqualTo(1032));
                return;
            }

#if UNITY_5_3_OR_NEWER
            // Fallback inside Unity: some Mono versions return 0 from GC.GetAllocatedBytesForCurrentThread
            // (fixed in 6000.1.4f1 according to the Unity issue tracker). Unity's profiler-based constraint
            // then measures the GC.Alloc samples instead.
            Assert.That(() => PublishMany(evt, 1000), UnityEngine.TestTools.Constraints.Is.Not.AllocatingGCMemory());
#else
            Assert.Inconclusive("GC.GetAllocatedBytesForCurrentThread() does not report allocations on this runtime.");
#endif
        }

        // ---- helpers -------------------------------------------------------------------------------------------

        private static bool AllocationCounterWorks()
        {
            long before = GC.GetAllocatedBytesForCurrentThread();
            var probe = new byte[256];
            long after = GC.GetAllocatedBytesForCurrentThread();
            GC.KeepAlive(probe);
            return after - before >= 256;
        }

        private void PublishMany(TestEventA evt, int count)
        {
            for (int i = 0; i < count; i++)
            {
                _bus.Publish(in evt);
            }
        }

        private CapturedLogEntry FindFirst(LogLevel level)
        {
            IReadOnlyList<CapturedLogEntry> entries = _log.Sink.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                if (entries[i].Level == level)
                {
                    return entries[i];
                }
            }

            Assert.Fail("No log entry with level " + level + ".");
            return default;
        }

        private void PublishFromThread()
        {
            _bus.Publish(new TestEventA(1));
        }

        private void CountA(TestEventA evt)
        {
            _countA++;
        }

        private void CountB(TestEventB evt)
        {
            _countB++;
        }

        private void RecordDepth(TestEventA evt)
        {
            _maxObservedDepth = Math.Max(_maxObservedDepth, _bus.PublishDepth);
        }

        private void RecordFirst(TestEventA evt)
        {
            _calls.Add("first");
        }

        private void RecordSecond(TestEventA evt)
        {
            _calls.Add("second");
        }

        private void RecordThird(TestEventA evt)
        {
            _calls.Add("third");
        }

        private void UnsubscribeSelf(TestEventA evt)
        {
            _calls.Add("self");
            _bus.Unsubscribe<TestEventA>(UnsubscribeSelf);
        }

        private void RemoveConfiguredHandler(TestEventA evt)
        {
            _bus.Unsubscribe(_handlerToRemove);
        }

        private void SubscribeCountAOnce(TestEventA evt)
        {
            _bus.Subscribe<TestEventA>(CountA);
            _bus.Unsubscribe<TestEventA>(SubscribeCountAOnce);
        }

        private void PublishNextUntilEight(TestEventA evt)
        {
            _countA++;
            _maxObservedDepth = Math.Max(_maxObservedDepth, _bus.PublishDepth);
            if (evt.Value < 8)
            {
                _bus.Publish(new TestEventA(evt.Value + 1));
            }
        }

        private void PublishNextForever(TestEventA evt)
        {
            _countA++;
            _bus.Publish(new TestEventA(evt.Value + 1));
        }

        private void PublishB(TestEventA evt)
        {
            _bus.Publish(new TestEventB("nested"));
        }

        private void ThrowOnB(TestEventB evt)
        {
            _countB++;
            throw new InvalidOperationException("Test exception in a nested handler.");
        }

        private void Throw(TestEventA evt)
        {
            throw new InvalidOperationException("Test exception in a handler.");
        }

        private sealed class CountingTarget
        {
            public int Count { get; private set; }

            public void OnEvent(TestEventA evt)
            {
                Count++;
            }
        }
    }
}
