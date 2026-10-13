using System;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;
#if UNITY_5_3_OR_NEWER
// Unity's allocation constraint (Unity Test Framework). The alias is the documented way to use it next to NUnit's Is;
// it derives from NUnit.Framework.Is, so Is.EqualTo etc. keep working. Kept in this small file on purpose.
using UnityEngine.TestTools.Constraints;
using Is = UnityEngine.TestTools.Constraints.Is;
#endif

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Checks that <see cref="EventBus.Publish{T}"/> allocates 0 bytes after warm-up (architecture 4.3, Phase 1 step 1.2).
    /// </summary>
    /// <remarks>
    /// Primary measurement: <see cref="GC.GetAllocatedBytesForCurrentThread"/> (part of .NET Standard 2.1, works outside Unity).
    /// Some Unity Mono versions returned 0 from it (Unity issue UUM-100690, fixed in 6000.1.4f1), which would make the test pass
    /// without measuring anything. A probe allocation therefore checks the counter first. If it does not count, the test uses
    /// Unity's profiler-based <c>Is.Not.AllocatingGCMemory()</c> inside Unity (guarded by <c>UNITY_5_3_OR_NEWER</c>) and
    /// reports "inconclusive" elsewhere.
    /// </remarks>
    [TestFixture]
    public sealed class EventBusAllocationTests
    {
        private const int WarmUpCount = 32;
        private const int MeasuredCount = 1000;

        private LogCapture _log;
        private EventBus _bus;
        private int _received;
        private int _sum;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _received = 0;
            _sum = 0;
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Publish_AfterWarmUp_DoesNotAllocate()
        {
            _bus.Subscribe<TestEventA>(OnEventCount);
            _bus.Subscribe<TestEventA>(OnEventSum);
            _bus.Subscribe<TestEventB>(OnOtherEvent);
            var evt = new TestEventA(7);

            // Warm-up: JIT compilation, dictionary comparer and other one-time allocations.
            PublishMany(evt, WarmUpCount);

            if (AllocationCounterWorks())
            {
                long before = GC.GetAllocatedBytesForCurrentThread();
                PublishMany(evt, MeasuredCount);
                long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

                Assert.That(allocated, Is.EqualTo(0L), "Publish must not allocate (architecture 4.3).");
                Assert.That(_received, Is.EqualTo(WarmUpCount + MeasuredCount));
                Assert.That(_sum, Is.EqualTo(7 * (WarmUpCount + MeasuredCount)));
                Assert.That(_log.Sink.Entries.Count, Is.EqualTo(0), _log.Sink.Dump());
                return;
            }

#if UNITY_5_3_OR_NEWER
            Assert.That(() => PublishMany(evt, MeasuredCount), Is.Not.AllocatingGCMemory());
#else
            Assert.Inconclusive("GC.GetAllocatedBytesForCurrentThread() does not report allocations on this runtime.");
#endif
        }

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

        private void OnEventCount(TestEventA evt)
        {
            _received++;
        }

        private void OnEventSum(TestEventA evt)
        {
            _sum += evt.Value;
        }

        private void OnOtherEvent(TestEventB evt)
        {
            _received += 1000000;
        }
    }
}
