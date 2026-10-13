// HARNESS ONLY - stand-in for UnityEngine.Awaitable (Unity 2023.1+ / 6000.x).
// The Unity 2021.3 reference assemblies used by the harness do not contain this type.
// Public surface follows Unity 6000.3 (no additional public members, so code that
// compiles against this shim also compiles against Unity 6.3).
//
// Harness semantics (differences to Unity):
// - There is no player loop. NextFrameAsync, FixedUpdateAsync and EndOfFrameAsync
//   complete immediately; WaitForSecondsAsync waits in real time on the thread pool.
// - Continuations run synchronously on the thread that completes the Awaitable.
// - Awaiting the same instance twice throws InvalidOperationException. In Unity this is
//   undefined behaviour because Awaitables are pooled (rule 15.2 #10).
// - GetResult() before completion throws InvalidOperationException (undefined in Unity).
// - AsyncOperation based members throw NotSupportedException (needs the engine).
using System;
using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Threading;
using System.Threading.Tasks;

namespace UnityEngine
{
    /// <summary>
    /// Harness stand-in for Unity's <c>Awaitable</c>: an awaitable, coroutine-compatible
    /// operation that can be used as the return type of async methods.
    /// </summary>
    [AsyncMethodBuilder(typeof(AwaitableAsyncMethodBuilder))]
    public partial class Awaitable : IEnumerator
    {
        private readonly object _gate = new object();
        private bool _completed;
        private Exception _exception;
        private Action _continuation;
        private bool _awaiterHandedOut;
        private CancellationTokenRegistration _cancellationRegistration;

        private Awaitable()
        {
        }

        /// <summary>True once the operation has finished (successfully, faulted or cancelled).</summary>
        public bool IsCompleted
        {
            get
            {
                lock (_gate)
                {
                    return _completed;
                }
            }
        }

        /// <summary>Cancels the operation; awaiting it then throws <see cref="OperationCanceledException"/>.</summary>
        public void Cancel()
        {
            TryComplete(new OperationCanceledException());
        }

        /// <summary>Returns the awaiter. Each Awaitable may be awaited only once.</summary>
        public Awaiter GetAwaiter()
        {
            lock (_gate)
            {
                if (_awaiterHandedOut)
                {
                    throw new InvalidOperationException(
                        "[Harness] This Awaitable is awaited a second time. Unity pools Awaitables; awaiting twice is undefined behaviour (rule 15.2 #10).");
                }

                _awaiterHandedOut = true;
            }

            return new Awaiter(this);
        }

        /// <summary>Waits for the next frame. Harness: completes immediately.</summary>
        public static Awaitable NextFrameAsync(CancellationToken cancellationToken = default)
        {
            return CompletedOrCancelled(cancellationToken);
        }

        /// <summary>Waits for the given number of seconds. Harness: real time on the thread pool.</summary>
        public static Awaitable WaitForSecondsAsync(float seconds, CancellationToken cancellationToken = default)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return NewCompleted(new OperationCanceledException(cancellationToken));
            }

            if (seconds <= 0f)
            {
                return NewCompleted(null);
            }

            Awaitable awaitable = NewPending(cancellationToken);
            int milliseconds = (int)Math.Ceiling(seconds * 1000.0);
            Task.Delay(milliseconds).ContinueWith(_ => awaitable.TryComplete(null), TaskScheduler.Default);
            return awaitable;
        }

        /// <summary>Waits for the next FixedUpdate. Harness: completes immediately.</summary>
        public static Awaitable FixedUpdateAsync(CancellationToken cancellationToken = default)
        {
            return CompletedOrCancelled(cancellationToken);
        }

        /// <summary>Waits until the end of the frame. Harness: completes immediately.</summary>
        public static Awaitable EndOfFrameAsync(CancellationToken cancellationToken = default)
        {
            return CompletedOrCancelled(cancellationToken);
        }

        /// <summary>Switches to the main thread. Harness: no thread switch (there is no main thread loop).</summary>
        public static MainThreadAwaitable MainThreadAsync()
        {
            return new MainThreadAwaitable();
        }

        /// <summary>Switches to a thread pool thread.</summary>
        public static BackgroundThreadAwaitable BackgroundThreadAsync()
        {
            return new BackgroundThreadAwaitable();
        }

        /// <summary>Wraps an AsyncOperation. Harness: not supported (AsyncOperation needs the engine).</summary>
        public static Awaitable FromAsyncOperation(AsyncOperation op, CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException("[Harness] Awaitable.FromAsyncOperation needs the Unity engine (AsyncOperation).");
        }

        bool IEnumerator.MoveNext()
        {
            lock (_gate)
            {
                if (!_completed)
                {
                    return true;
                }
            }

            ThrowIfFaulted();
            return false;
        }

        void IEnumerator.Reset()
        {
            throw new NotSupportedException();
        }

        object IEnumerator.Current => null;

        internal static Awaitable NewPending(CancellationToken cancellationToken)
        {
            Awaitable awaitable = new Awaitable();
            if (cancellationToken.CanBeCanceled)
            {
                awaitable._cancellationRegistration = cancellationToken.Register(
                    state => ((Awaitable)state).TryComplete(new OperationCanceledException()), awaitable);
            }

            return awaitable;
        }

        internal static Awaitable NewCompleted(Exception exception)
        {
            Awaitable awaitable = new Awaitable();
            awaitable._completed = true;
            awaitable._exception = exception;
            return awaitable;
        }

        internal bool TryComplete(Exception exception)
        {
            Action continuation;
            lock (_gate)
            {
                if (_completed)
                {
                    return false;
                }

                _completed = true;
                _exception = exception;
                continuation = _continuation;
                _continuation = null;
            }

            _cancellationRegistration.Dispose();
            continuation?.Invoke();
            return true;
        }

        internal void SetContinuation(Action continuation)
        {
            bool runNow;
            lock (_gate)
            {
                runNow = _completed;
                if (!runNow)
                {
                    if (_continuation != null)
                    {
                        throw new InvalidOperationException("[Harness] Awaitable already has a continuation (awaited twice?).");
                    }

                    _continuation = continuation;
                }
            }

            if (runNow)
            {
                continuation();
            }
        }

        internal void GetResultOrThrow()
        {
            lock (_gate)
            {
                if (!_completed)
                {
                    // Unity: "Calling GetResult() before the operation is completed is undefined behaviour".
                    throw new InvalidOperationException(
                        "[Harness] GetResult() was called before the Awaitable completed. In Unity this is undefined behaviour; await it instead (e.g. use an async test method).");
                }
            }

            ThrowIfFaulted();
        }

        private void ThrowIfFaulted()
        {
            Exception exception;
            lock (_gate)
            {
                exception = _exception;
            }

            if (exception != null)
            {
                ExceptionDispatchInfo.Capture(exception).Throw();
            }
        }

        private static Awaitable CompletedOrCancelled(CancellationToken cancellationToken)
        {
            return cancellationToken.IsCancellationRequested
                ? NewCompleted(new OperationCanceledException(cancellationToken))
                : NewCompleted(null);
        }
    }
}
