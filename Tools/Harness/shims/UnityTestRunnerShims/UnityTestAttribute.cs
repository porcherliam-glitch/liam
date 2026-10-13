// HARNESS ONLY - stand-in for UnityEngine.TestTools.UnityTestAttribute (Unity Test Framework).
// [UnityTest] tests are coroutines driven by the Unity player loop; the harness cannot run
// them and reports them as ignored with a clear reason.
using System;
using NUnit.Framework;
using NUnit.Framework.Interfaces;
using NUnit.Framework.Internal;
using NUnit.Framework.Internal.Builders;

namespace UnityEngine.TestTools
{
    /// <summary>Harness stand-in for <c>[UnityTest]</c>: builds the test as "ignored - needs Unity".</summary>
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
    public class UnityTestAttribute : NUnitAttribute, ISimpleTestBuilder, IImplyFixture
    {
        private readonly NUnitTestCaseBuilder _builder = new NUnitTestCaseBuilder();

        /// <summary>Builds an ignored test method.</summary>
        public TestMethod BuildFrom(IMethodInfo method, Test suite)
        {
            TestMethod test = _builder.BuildTestMethod(method, suite, null);
            test.RunState = RunState.Ignored;
            test.Properties.Set(PropertyNames.SkipReason,
                "[Harness] [UnityTest] needs the Unity player loop - run it in the Unity Test Runner.");
            return test;
        }
    }
}
