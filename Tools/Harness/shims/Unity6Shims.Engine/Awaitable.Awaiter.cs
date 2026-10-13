// HARNESS ONLY - stand-in for UnityEngine.Awaitable.Awaiter (Unity 6000.x).
using System;
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    public partial class Awaitable
    {
        /// <summary>Awaiter returned by <see cref="Awaitable.GetAwaiter"/>.</summary>
        public struct Awaiter : INotifyCompletion
        {
            private readonly Awaitable _awaited;

            internal Awaiter(Awaitable awaited)
            {
                _awaited = awaited;
            }

            /// <summary>Schedules the continuation; runs synchronously when the Awaitable completes.</summary>
            public void OnCompleted(Action continuation)
            {
                _awaited.SetContinuation(continuation);
            }

            /// <summary>True once the awaited operation has finished.</summary>
            public bool IsCompleted => _awaited.IsCompleted;

            /// <summary>Rethrows the operation's exception, if any.</summary>
            public void GetResult()
            {
                _awaited.GetResultOrThrow();
            }
        }
    }
}
