// HARNESS ONLY - stand-in for UnityEngine.AsyncOperationAwaitableExtensions (Unity 2023.1+ / 6000.x).
// Makes "await SceneManager.LoadSceneAsync(...)" compile. Running it needs the engine.
using System;

namespace UnityEngine
{
    /// <summary>Makes <see cref="AsyncOperation"/> awaitable (compile-time only in the harness).</summary>
    public static class AsyncOperationAwaitableExtensions
    {
        /// <summary>Harness: throws, because AsyncOperation only exists inside the Unity engine.</summary>
        public static Awaitable.Awaiter GetAwaiter(this AsyncOperation op)
        {
            throw new NotSupportedException("[Harness] Awaiting an AsyncOperation needs the Unity engine.");
        }
    }
}
