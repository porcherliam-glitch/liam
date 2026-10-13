// HARNESS ONLY - stand-in for UnityEngine.UnityEventAwaitableExtensions (Unity 2023.1+ / 6000.x).
// "await someUnityEvent" completes when the event is invoked the next time.
using UnityEngine.Events;

namespace UnityEngine
{
    /// <summary>Makes UnityEvents awaitable: the await completes on the next invocation.</summary>
    public static class UnityEventAwaitableExtensions
    {
        /// <summary>Awaits the next invocation of the event.</summary>
        public static Awaitable.Awaiter GetAwaiter(this UnityEvent ev)
        {
            Awaitable awaitable = Awaitable.NewPending(default);
            UnityAction handler = null;
            handler = () =>
            {
                ev.RemoveListener(handler);
                awaitable.TryComplete(null);
            };
            ev.AddListener(handler);
            return awaitable.GetAwaiter();
        }

        /// <summary>Awaits the next invocation of the event and returns its argument.</summary>
        public static Awaitable<T>.Awaiter GetAwaiter<T>(this UnityEvent<T> ev)
        {
            Awaitable<T> awaitable = Awaitable<T>.NewPending(default);
            UnityAction<T> handler = null;
            handler = arg =>
            {
                ev.RemoveListener(handler);
                awaitable.TrySetResult(arg);
            };
            ev.AddListener(handler);
            return awaitable.GetAwaiter();
        }

        /// <summary>Awaits the next invocation of the event and returns its arguments.</summary>
        public static Awaitable<(T0, T1)>.Awaiter GetAwaiter<T0, T1>(this UnityEvent<T0, T1> ev)
        {
            Awaitable<(T0, T1)> awaitable = Awaitable<(T0, T1)>.NewPending(default);
            UnityAction<T0, T1> handler = null;
            handler = (arg0, arg1) =>
            {
                ev.RemoveListener(handler);
                awaitable.TrySetResult((arg0, arg1));
            };
            ev.AddListener(handler);
            return awaitable.GetAwaiter();
        }

        /// <summary>Awaits the next invocation of the event and returns its arguments.</summary>
        public static Awaitable<(T0, T1, T2)>.Awaiter GetAwaiter<T0, T1, T2>(this UnityEvent<T0, T1, T2> ev)
        {
            Awaitable<(T0, T1, T2)> awaitable = Awaitable<(T0, T1, T2)>.NewPending(default);
            UnityAction<T0, T1, T2> handler = null;
            handler = (arg0, arg1, arg2) =>
            {
                ev.RemoveListener(handler);
                awaitable.TrySetResult((arg0, arg1, arg2));
            };
            ev.AddListener(handler);
            return awaitable.GetAwaiter();
        }

        /// <summary>Awaits the next invocation of the event and returns its arguments.</summary>
        public static Awaitable<(T0, T1, T2, T3)>.Awaiter GetAwaiter<T0, T1, T2, T3>(this UnityEvent<T0, T1, T2, T3> ev)
        {
            Awaitable<(T0, T1, T2, T3)> awaitable = Awaitable<(T0, T1, T2, T3)>.NewPending(default);
            UnityAction<T0, T1, T2, T3> handler = null;
            handler = (arg0, arg1, arg2, arg3) =>
            {
                ev.RemoveListener(handler);
                awaitable.TrySetResult((arg0, arg1, arg2, arg3));
            };
            ev.AddListener(handler);
            return awaitable.GetAwaiter();
        }
    }
}
