// HARNESS ONLY - stand-in for UnityEngine.Awaitable.AwaitableAsyncMethodBuilder<T> (Unity 6000.x).
// Lets "async Awaitable<T> Foo()" compile and run under plain .NET.
using System;
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    public partial class Awaitable
    {
        /// <summary>Async method builder for methods returning <see cref="Awaitable{T}"/>.</summary>
        public struct AwaitableAsyncMethodBuilder<T>
        {
            private Awaitable<T> _task;
            private Action _moveNext;

            /// <summary>Creates a builder (called by compiler-generated code).</summary>
            public static AwaitableAsyncMethodBuilder<T> Create() => default;

            /// <summary>The Awaitable that represents the async method.</summary>
            public Awaitable<T> Task
            {
                get
                {
                    if (_task == null)
                    {
                        _task = Awaitable<T>.NewPending(default);
                    }

                    return _task;
                }
            }

            /// <summary>Completes the Awaitable with a result.</summary>
            public void SetResult(T value)
            {
                Task.TrySetResult(value);
            }

            /// <summary>Completes the Awaitable with an exception.</summary>
            public void SetException(Exception e)
            {
                Task.TrySetException(e);
            }

            /// <summary>Starts the state machine.</summary>
            public void Start<TStateMachine>(ref TStateMachine stateMachine) where TStateMachine : IAsyncStateMachine
            {
                if (_task == null)
                {
                    _task = Awaitable<T>.NewPending(default);
                }

                stateMachine.MoveNext();
            }

            /// <summary>Not used by this builder.</summary>
            public void SetStateMachine(IAsyncStateMachine stateMachine)
            {
            }

            /// <summary>Schedules the state machine to continue when the awaiter completes.</summary>
            public void AwaitOnCompleted<TAwaiter, TStateMachine>(ref TAwaiter awaiter, ref TStateMachine stateMachine)
                where TAwaiter : INotifyCompletion
                where TStateMachine : IAsyncStateMachine
            {
                awaiter.OnCompleted(GetMoveNext(ref stateMachine));
            }

            /// <summary>Schedules the state machine to continue when the awaiter completes.</summary>
            public void AwaitUnsafeOnCompleted<TAwaiter, TStateMachine>(ref TAwaiter awaiter, ref TStateMachine stateMachine)
                where TAwaiter : ICriticalNotifyCompletion
                where TStateMachine : IAsyncStateMachine
            {
                awaiter.UnsafeOnCompleted(GetMoveNext(ref stateMachine));
            }

            private Action GetMoveNext<TStateMachine>(ref TStateMachine stateMachine) where TStateMachine : IAsyncStateMachine
            {
                if (_moveNext == null)
                {
                    StateMachineRunner runner = new StateMachineRunner();
                    _moveNext = runner.Run;
                    runner.StateMachine = stateMachine;
                }

                return _moveNext;
            }
        }
    }
}
