// HARNESS ONLY - stand-in for UnityEngine.AwaitableCompletionSource<T> (Unity 2023.1+ / 6000.x).
using System;

namespace UnityEngine
{
    /// <summary>Harness stand-in for Unity's <c>AwaitableCompletionSource&lt;T&gt;</c>.</summary>
    public class AwaitableCompletionSource<T>
    {
        /// <summary>The Awaitable controlled by this source.</summary>
        public Awaitable<T> Awaitable { get; private set; } = Awaitable<T>.NewPending(default);

        /// <summary>Completes the Awaitable with a result; throws if it is already completed.</summary>
        public void SetResult(in T value)
        {
            if (!TrySetResult(value))
            {
                throw new InvalidOperationException("Can't raise completion of the same Awaitable twice");
            }
        }

        /// <summary>Cancels the Awaitable; throws if it is already completed.</summary>
        public void SetCanceled()
        {
            if (!TrySetCanceled())
            {
                throw new InvalidOperationException("Can't raise completion of the same Awaitable twice");
            }
        }

        /// <summary>Completes the Awaitable with an exception; throws if it is already completed.</summary>
        public void SetException(Exception exception)
        {
            if (!TrySetException(exception))
            {
                throw new InvalidOperationException("Can't raise completion of the same Awaitable twice");
            }
        }

        /// <summary>Completes the Awaitable with a result unless it is already completed.</summary>
        public bool TrySetResult(in T value)
        {
            return Awaitable.TrySetResult(value);
        }

        /// <summary>Cancels the Awaitable unless it is already completed.</summary>
        public bool TrySetCanceled()
        {
            return Awaitable.TrySetCanceled();
        }

        /// <summary>Completes the Awaitable with an exception unless it is already completed.</summary>
        public bool TrySetException(Exception exception)
        {
            return Awaitable.TrySetException(exception);
        }

        /// <summary>Replaces the Awaitable with a fresh, pending one.</summary>
        public void Reset()
        {
            Awaitable = Awaitable<T>.NewPending(default);
        }
    }
}
