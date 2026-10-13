// Harness-only stub of the Unity Test Framework constraint API (shape as documented).
using NUnit.Framework.Constraints;
namespace UnityEngine.TestTools.Constraints
{
    public class Is : NUnit.Framework.Is { }
    public class AllocatingGCMemoryConstraint : Constraint
    {
        public override ConstraintResult ApplyTo<TActual>(TActual actual) { return new ConstraintResult(this, actual, true); }
    }
    public static class ConstraintExtensions
    {
        public static AllocatingGCMemoryConstraint AllocatingGCMemory(this ConstraintExpression chain)
        {
            var constraint = new AllocatingGCMemoryConstraint();
            chain.Append(constraint);
            return constraint;
        }
    }
}
