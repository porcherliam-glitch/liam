// HARNESS ONLY - stand-in for UnityEngine.AwaitableCompletionSource (Unity 2023.1+ / 6000.x).
using System;

namespace UnityEngine
{
    /// <summary>Harness stand-in for Unity's <c>AwaitableCompletionSource</c>: completes an Awaitable manually.</summary>
    public class AwaitableCompletionSource
    {
        /// <summary>The Awaitable controlled by this source.</summary>
        public Awaitable Awaitable { get; private set; } = Awaitable.NewPending(default);

        /// <summary>Completes the Awaitable successfully; throws if it is already completed.</summary>
        public void SetResult()
        {
            if (!TrySetResult())
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

        /// <summary>Completes the Awaitable successfully unless it is already completed.</summary>
        public bool TrySetResult()
        {
            return Awaitable.TryComplete(null);
        }

        /// <summary>Cancels the Awaitable unless it is already completed.</summary>
        public bool TrySetCanceled()
        {
            return Awaitable.TryComplete(new OperationCanceledException());
        }

        /// <summary>Completes the Awaitable with an exception unless it is already completed.</summary>
        public bool TrySetException(Exception exception)
        {
            return Awaitable.TryComplete(exception);
        }

        /// <summary>Replaces the Awaitable with a fresh, pending one.</summary>
        public void Reset()
        {
            Awaitable = Awaitable.NewPending(default);
        }
    }
}
