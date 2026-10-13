// HARNESS ONLY - stand-in for UnityEngine.BackgroundThreadAwaitable (Unity 2023.1+ / 6000.x).
using System;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

namespace UnityEngine
{
    /// <summary>Returned by <see cref="Awaitable.BackgroundThreadAsync"/>: continues on a thread pool thread.</summary>
    public struct BackgroundThreadAwaitable : INotifyCompletion
    {
        /// <summary>Returns itself (awaitable pattern).</summary>
        public BackgroundThreadAwaitable GetAwaiter() => this;

        /// <summary>Harness: always false, so awaiting always hops to the thread pool.</summary>
        public bool IsCompleted => false;

        /// <summary>No result.</summary>
        public void GetResult()
        {
        }

        /// <summary>Runs the continuation on the thread pool.</summary>
        public void OnCompleted(Action continuation)
        {
            Task.Run(continuation);
        }
    }
}
