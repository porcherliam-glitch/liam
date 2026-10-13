// HARNESS ONLY - stand-in for UnityEngine.TestTools.Constraints.Is (Unity Test Framework).
// Derives from NUnit's Is like the original, so Is.EqualTo etc. keep working next to it.
namespace UnityEngine.TestTools.Constraints
{
    /// <summary>Harness stand-in: adds <c>Is.AllocatingGCMemory()</c> to NUnit's <c>Is</c>.</summary>
    public class Is : NUnit.Framework.Is
    {
        /// <summary>Constraint that succeeds if the delegate allocates managed memory.</summary>
        public static AllocatingGCMemoryConstraint AllocatingGCMemory()
        {
            return new AllocatingGCMemoryConstraint();
        }
    }
}
