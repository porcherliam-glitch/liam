// HARNESS ONLY - stand-in for UnityEngine.Awaitable.AwaitableAsyncMethodBuilder (Unity 6000.x).
// Lets "async Awaitable Foo()" compile and run under plain .NET.
using System;
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    public partial class Awaitable
    {
        /// <summary>Async method builder for methods returning <see cref="Awaitable"/>.</summary>
        public struct AwaitableAsyncMethodBuilder
        {
            private Awaitable _task;
            private Action _moveNext;

            /// <summary>Creates a builder (called by compiler-generated code).</summary>
            public static AwaitableAsyncMethodBuilder Create() => default;

            /// <summary>The Awaitable that represents the async method.</summary>
            public Awaitable Task
            {
                get
                {
                    if (_task == null)
                    {
                        _task = NewPending(default);
                    }

                    return _task;
                }
            }

            /// <summary>Starts the state machine.</summary>
            public void Start<TStateMachine>(ref TStateMachine stateMachine) where TStateMachine : IAsyncStateMachine
            {
                // Create the result before the state machine can be boxed (struct copy semantics).
                if (_task == null)
                {
                    _task = NewPending(default);
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

            /// <summary>Completes the Awaitable with an exception.</summary>
            public void SetException(Exception e)
            {
                Task.TryComplete(e);
            }

            /// <summary>Completes the Awaitable successfully.</summary>
            public void SetResult()
            {
                Task.TryComplete(null);
            }

            private Action GetMoveNext<TStateMachine>(ref TStateMachine stateMachine) where TStateMachine : IAsyncStateMachine
            {
                if (_moveNext == null)
                {
                    // Set the field on this builder (still inside the caller's state machine)
                    // BEFORE boxing, so the boxed copy carries the same delegate and task.
                    StateMachineRunner runner = new StateMachineRunner();
                    _moveNext = runner.Run;
                    runner.StateMachine = stateMachine;
                }

                return _moveNext;
            }
        }
    }
}
