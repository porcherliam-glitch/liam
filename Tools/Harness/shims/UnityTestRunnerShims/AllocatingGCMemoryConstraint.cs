// HARNESS ONLY - stand-in for UnityEngine.TestTools.Constraints.AllocatingGCMemoryConstraint.
// Unity measures with the profiler recorder "GC.Alloc"; the harness uses
// GC.GetAllocatedBytesForCurrentThread() of .NET, which counts the same managed
// allocations on the calling thread. No warm-up call (same as Unity): JIT or first-use
// allocations of the delegate are counted, so tests should warm up themselves.
using System;
using NUnit.Framework;
using NUnit.Framework.Constraints;

namespace UnityEngine.TestTools.Constraints
{
    /// <summary>Succeeds if invoking the delegate allocates managed (GC) memory.</summary>
    public class AllocatingGCMemoryConstraint : Constraint
    {
        /// <inheritdoc />
        public override string Description => "allocates GC memory";

        /// <inheritdoc />
        public override ConstraintResult ApplyTo<TActual>(TActual actual)
        {
            TestDelegate testDelegate = actual as TestDelegate;
            Action action = actual as Action;
            if (testDelegate == null && action == null)
            {
                throw new ArgumentException("The actual value must be a TestDelegate or an Action.", nameof(actual));
            }

            long before = GC.GetAllocatedBytesForCurrentThread();
            if (testDelegate != null)
            {
                testDelegate();
            }
            else
            {
                action();
            }

            long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
            return new AllocationResult(this, actual, allocated);
        }

        private sealed class AllocationResult : ConstraintResult
        {
            private readonly long _allocatedBytes;

            public AllocationResult(IConstraint constraint, object actualValue, long allocatedBytes)
                : base(constraint, actualValue, allocatedBytes > 0)
            {
                _allocatedBytes = allocatedBytes;
            }

            public override void WriteActualValueTo(MessageWriter writer)
            {
                writer.Write(_allocatedBytes == 0 ? "no GC allocation" : "allocated " + _allocatedBytes + " bytes (harness: GC.GetAllocatedBytesForCurrentThread)");
            }
        }
    }
}
