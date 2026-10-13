// HARNESS ONLY - stand-in for UnityEngine.MainThreadAwaitable (Unity 2023.1+ / 6000.x).
using System;
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    /// <summary>
    /// Returned by <see cref="Awaitable.MainThreadAsync"/>. Harness: there is no Unity main
    /// thread loop, so awaiting it never switches threads.
    /// </summary>
    public struct MainThreadAwaitable : INotifyCompletion
    {
        /// <summary>Returns itself (awaitable pattern).</summary>
        public MainThreadAwaitable GetAwaiter() => this;

        /// <summary>Harness: always true (continue on the current thread).</summary>
        public bool IsCompleted => true;

        /// <summary>No result.</summary>
        public void GetResult()
        {
        }

        /// <summary>Runs the continuation immediately.</summary>
        public void OnCompleted(Action continuation)
        {
            continuation();
        }
    }
}
