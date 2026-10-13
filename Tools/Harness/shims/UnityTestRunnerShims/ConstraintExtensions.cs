// HARNESS ONLY - stand-in for UnityEngine.TestTools.Constraints.ConstraintExtensions (Unity Test Framework).
using NUnit.Framework.Constraints;

namespace UnityEngine.TestTools.Constraints
{
    /// <summary>Harness stand-in: enables <c>Is.Not.AllocatingGCMemory()</c>.</summary>
    public static class ConstraintExtensions
    {
        /// <summary>Appends an <see cref="AllocatingGCMemoryConstraint"/> to the expression.</summary>
        public static AllocatingGCMemoryConstraint AllocatingGCMemory(this ConstraintExpression chain)
        {
            AllocatingGCMemoryConstraint constraint = new AllocatingGCMemoryConstraint();
            chain.Append(constraint);
            return constraint;
        }
    }
}
