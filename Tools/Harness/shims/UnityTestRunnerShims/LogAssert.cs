// HARNESS ONLY - stand-in for UnityEngine.TestTools.LogAssert (Unity Test Framework).
// LogAssert inspects Unity's log; there is no Unity log in the harness, so any use marks
// the running test as ignored ("needs Unity") instead of silently passing.
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace UnityEngine.TestTools
{
    /// <summary>Harness stand-in for <c>LogAssert</c>: every call ignores the current test.</summary>
    public static class LogAssert
    {
        private const string Reason = "[Harness] LogAssert needs the Unity log - run this test in the Unity Test Runner.";

        /// <summary>Harness: ignores the current test.</summary>
        public static bool ignoreFailingMessages
        {
            get { return false; }
            set { Assert.Ignore(Reason); }
        }

        /// <summary>Harness: ignores the current test.</summary>
        public static void Expect(LogType type, string message)
        {
            Assert.Ignore(Reason);
        }

        /// <summary>Harness: ignores the current test.</summary>
        public static void Expect(LogType type, Regex message)
        {
            Assert.Ignore(Reason);
        }

        /// <summary>Harness: ignores the current test.</summary>
        public static void NoUnexpectedReceived()
        {
            Assert.Ignore(Reason);
        }
    }
}
