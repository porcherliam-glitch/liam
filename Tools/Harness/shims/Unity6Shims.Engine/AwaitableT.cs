// HARNESS ONLY - stand-in for UnityEngine.Awaitable<T> (Unity 2023.1+ / 6000.x).
// Public surface follows Unity 6000.3: Cancel() and GetAwaiter() only (no public IsCompleted).
using System;
using System.Runtime.CompilerServices;
using System.Threading;

namespace UnityEngine
{
    /// <summary>
    /// Harness stand-in for Unity's <c>Awaitable&lt;T&gt;</c>: an awaitable operation with a result.
    /// </summary>
    [AsyncMethodBuilder(typeof(Awaitable.AwaitableAsyncMethodBuilder<>))]
    public class Awaitable<T>
    {
        private Awaitable _awaitable;
        private T _result;

        private Awaitable()
        {
        }

        /// <summary>Cancels the operation; awaiting it then throws <see cref="OperationCanceledException"/>.</summary>
        public void Cancel()
        {
            _awaitable.Cancel();
        }

        /// <summary>Returns the awaiter. Each Awaitable may be awaited only once.</summary>
        public Awaiter GetAwaiter()
        {
            // Reuse the double-await detection of the inner Awaitable.
            _awaitable.GetAwaiter();
            return new Awaiter(this);
        }

        internal static Awaitable<T> NewPending(CancellationToken cancellationToken)
        {
            Awaitable<T> result = new Awaitable<T>();
            result._awaitable = Awaitable.NewPending(cancellationToken);
            return result;
        }

        internal bool IsCompletedInternal => _awaitable.IsCompleted;

        internal bool TrySetResult(T value)
        {
            if (_awaitable.IsCompleted)
            {
                return false;
            }

            _result = value;
            return _awaitable.TryComplete(null);
        }

        internal bool TrySetException(Exception exception)
        {
            return _awaitable.TryComplete(exception);
        }

        internal bool TrySetCanceled()
        {
            return _awaitable.TryComplete(new OperationCanceledException());
        }

        private T GetResult()
        {
            _awaitable.GetResultOrThrow();
            return _result;
        }

        /// <summary>Awaiter returned by <see cref="Awaitable{T}.GetAwaiter"/>.</summary>
        public struct Awaiter : INotifyCompletion
        {
            private readonly Awaitable<T> _coroutine;

            /// <summary>Creates an awaiter for the given Awaitable.</summary>
            public Awaiter(Awaitable<T> coroutine)
            {
                _coroutine = coroutine;
            }

            /// <summary>Schedules the continuation; runs synchronously when the Awaitable completes.</summary>
            public void OnCompleted(Action continuation)
            {
                _coroutine._awaitable.SetContinuation(continuation);
            }

            /// <summary>True once the awaited operation has finished.</summary>
            public bool IsCompleted => _coroutine._awaitable.IsCompleted;

            /// <summary>Returns the result or rethrows the operation's exception.</summary>
            public T GetResult() => _coroutine.GetResult();
        }
    }
}
