// Harness-only: Unity 6 API that the 2021.3 reference assemblies lack (signatures as documented for Unity 6).
using System;
using System.Runtime.CompilerServices;
using System.Threading;

namespace UnityEngine
{
    [AsyncMethodBuilder(typeof(AwaitableAsyncMethodBuilder))]
    public class Awaitable
    {
        public static Awaitable NextFrameAsync(CancellationToken cancellationToken = default) { return null; }
        public static Awaitable WaitForSecondsAsync(float seconds, CancellationToken cancellationToken = default) { return null; }
        public Awaiter GetAwaiter() { return default; }

        public struct Awaiter : INotifyCompletion
        {
            public bool IsCompleted => true;
            public void GetResult() { }
            public void OnCompleted(Action continuation) { }
        }

        public struct AwaitableAsyncMethodBuilder
        {
            public static AwaitableAsyncMethodBuilder Create() { return default; }
            public Awaitable Task => null;
            public void Start<TStateMachine>(ref TStateMachine stateMachine) where TStateMachine : IAsyncStateMachine { }
            public void SetStateMachine(IAsyncStateMachine stateMachine) { }
            public void SetException(Exception exception) { }
            public void SetResult() { }
            public void AwaitOnCompleted<TAwaiter, TStateMachine>(ref TAwaiter awaiter, ref TStateMachine stateMachine)
                where TAwaiter : INotifyCompletion where TStateMachine : IAsyncStateMachine { }
            public void AwaitUnsafeOnCompleted<TAwaiter, TStateMachine>(ref TAwaiter awaiter, ref TStateMachine stateMachine)
                where TAwaiter : ICriticalNotifyCompletion where TStateMachine : IAsyncStateMachine { }
        }
    }
}

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class InitializeOnLoadMethodAttribute : Attribute { }
}
