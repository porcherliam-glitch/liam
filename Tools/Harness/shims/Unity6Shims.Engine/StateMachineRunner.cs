// HARNESS ONLY - internal helper of the Awaitable shims (not part of Unity's API).
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    /// <summary>Holds the boxed async state machine and resumes it.</summary>
    internal sealed class StateMachineRunner
    {
        internal IAsyncStateMachine StateMachine;

        internal void Run()
        {
            StateMachine.MoveNext();
        }
    }
}
