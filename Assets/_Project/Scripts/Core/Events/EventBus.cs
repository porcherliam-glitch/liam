using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Default <see cref="IEventBus"/> implementation (architecture 4.3, ADR A08). Pure logic, no Unity calls.
    /// </summary>
    /// <remarks>
    /// <para><b>Allocation-free publishing:</b> each event type has a channel with an array of subscriptions.
    /// Subscribe and Unsubscribe replace the array (copy-on-write, allocation only there); Publish iterates the
    /// current array without copying it. Event lookup uses <c>typeof(T)</c> and a dictionary, both allocation-free.</para>
    /// <para><b>Changes during Publish:</b> Publish iterates the array it read at the start. A handler removed during
    /// the delivery is skipped (its subscription is flagged inactive); a handler added during the delivery is not part of
    /// that array and receives events from the next Publish on.</para>
    /// <para><b>Duplicate subscriptions:</b> subscribing an equal delegate (same target and method) twice is ignored
    /// and logged as a warning, so the handler is called once and one Unsubscribe removes it.</para>
    /// <para><b>Nesting:</b> publishing from inside a handler is allowed up to <see cref="MaxPublishDepth"/> levels
    /// (the outermost Publish is level 1). A Publish beyond that is rejected and logged as an error; the outer
    /// deliveries continue normally.</para>
    /// <para><b>Threading:</b> main thread only. Calls from another thread than the creating one are rejected and logged.</para>
    /// </remarks>
    public sealed class EventBus : IEventBus, IDisposable
    {
        /// <summary>Maximum nesting depth of Publish calls (architecture 4.3).</summary>
        public const int MaxPublishDepth = 8;

        private readonly Dictionary<Type, IChannel> _channels = new Dictionary<Type, IChannel>();
        private readonly int _ownerThreadId;
        private int _depth;
        private bool _disposed;

        /// <summary>Creates an event bus owned by the calling thread (the Unity main thread in the game).</summary>
        public EventBus()
        {
            _ownerThreadId = Environment.CurrentManagedThreadId;
        }

        private interface IChannel
        {
            int Count { get; }

            void Clear();
        }

        /// <summary>Number of Publish calls currently being delivered (0 outside of any delivery).</summary>
        public int PublishDepth => _depth;

        /// <summary>Number of handlers currently subscribed to <typeparamref name="T"/>.</summary>
        /// <typeparam name="T">Event type.</typeparam>
        public int GetSubscriberCount<T>() where T : struct, IGameEvent
        {
            return _channels.TryGetValue(typeof(T), out IChannel channel) ? channel.Count : 0;
        }

        /// <inheritdoc />
        public void Subscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (handler == null)
            {
                throw new ArgumentNullException(nameof(handler));
            }

            if (!IsOwnerThread("Subscribe", typeof(T)))
            {
                return;
            }

            if (_disposed)
            {
                Log.Warning(LogCategory.Events, "Subscribe<" + typeof(T).Name + "> ignored because the event bus is disposed.");
                return;
            }

            Channel<T> channel;
            if (_channels.TryGetValue(typeof(T), out IChannel existing))
            {
                channel = (Channel<T>)existing;
            }
            else
            {
                channel = new Channel<T>();
                _channels.Add(typeof(T), channel);
            }

            if (!channel.Add(handler))
            {
                Log.Warning(LogCategory.Events, "Handler " + DescribeHandler(handler) + " is already subscribed to " + typeof(T).Name +
                                                ". The second subscription is ignored. Check that OnEnable/OnDisable (or PostInitialize/Dispose) are balanced.");
            }
        }

        /// <inheritdoc />
        public void Unsubscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (handler == null || !IsOwnerThread("Unsubscribe", typeof(T)))
            {
                return;
            }

            if (_channels.TryGetValue(typeof(T), out IChannel existing))
            {
                ((Channel<T>)existing).Remove(handler);
            }
        }

        /// <inheritdoc />
        public void Publish<T>(in T evt) where T : struct, IGameEvent
        {
            if (Environment.CurrentManagedThreadId != _ownerThreadId)
            {
                LogWrongThread("Publish", typeof(T));
                return;
            }

            if (!_channels.TryGetValue(typeof(T), out IChannel existing))
            {
                return;
            }

            Subscription<T>[] subscriptions = ((Channel<T>)existing).Subscriptions;
            if (subscriptions.Length == 0)
            {
                return;
            }

            if (_depth >= MaxPublishDepth)
            {
                LogDepthExceeded(typeof(T));
                return;
            }

            _depth++;
            try
            {
                for (int i = 0; i < subscriptions.Length; i++)
                {
                    Subscription<T> subscription = subscriptions[i];
                    if (!subscription.IsActive)
                    {
                        continue;
                    }

                    try
                    {
                        subscription.Handler(evt);
                    }
                    catch (Exception exception)
                    {
                        LogHandlerException(subscription.Handler, typeof(T), exception);
                    }
                }
            }
            finally
            {
                _depth--;
            }
        }

        /// <summary>Removes all subscriptions. Later Subscribe calls are ignored; Publish and Unsubscribe become no-ops.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            foreach (IChannel channel in _channels.Values)
            {
                channel.Clear();
            }

            _channels.Clear();
        }

        private bool IsOwnerThread(string operation, Type eventType)
        {
            if (Environment.CurrentManagedThreadId == _ownerThreadId)
            {
                return true;
            }

            LogWrongThread(operation, eventType);
            return false;
        }

        private static void LogWrongThread(string operation, Type eventType)
        {
            Log.Error(LogCategory.Events, operation + "<" + eventType.Name + "> was called from a background thread and is ignored. " +
                                          "The event bus is main-thread only; switch back with Awaitable.MainThreadAsync() first.");
        }

        private static void LogDepthExceeded(Type eventType)
        {
            Log.Error(LogCategory.Events, "Publish of " + eventType.Name + " rejected: nesting depth limit of " + MaxPublishDepth +
                                          " reached (possible endless event loop). Check handlers that publish events while handling events.");
        }

        private static void LogHandlerException(Delegate handler, Type eventType, Exception exception)
        {
            Log.Exception(LogCategory.Events, exception,
                "Handler " + DescribeHandler(handler) + " threw an exception while handling " + eventType.Name + ". The remaining handlers still run.");
        }

        private static string DescribeHandler(Delegate handler)
        {
            System.Reflection.MethodInfo method = handler.Method;
            string typeName = method.DeclaringType != null ? method.DeclaringType.Name : "?";
            return typeName + "." + method.Name;
        }

        private sealed class Channel<T> : IChannel where T : struct, IGameEvent
        {
            public Subscription<T>[] Subscriptions { get; private set; } = Array.Empty<Subscription<T>>();

            public int Count => Subscriptions.Length;

            public bool Add(Action<T> handler)
            {
                Subscription<T>[] current = Subscriptions;
                for (int i = 0; i < current.Length; i++)
                {
                    if (current[i].Handler == handler)
                    {
                        return false;
                    }
                }

                var next = new Subscription<T>[current.Length + 1];
                Array.Copy(current, next, current.Length);
                next[current.Length] = new Subscription<T>(handler);
                Subscriptions = next;
                return true;
            }

            public void Remove(Action<T> handler)
            {
                Subscription<T>[] current = Subscriptions;
                int index = -1;
                for (int i = 0; i < current.Length; i++)
                {
                    if (current[i].Handler == handler)
                    {
                        index = i;
                        break;
                    }
                }

                if (index < 0)
                {
                    return;
                }

                // Flag first: a Publish that is iterating the old array skips this handler from now on.
                current[index].IsActive = false;

                if (current.Length == 1)
                {
                    Subscriptions = Array.Empty<Subscription<T>>();
                    return;
                }

                var next = new Subscription<T>[current.Length - 1];
                Array.Copy(current, 0, next, 0, index);
                Array.Copy(current, index + 1, next, index, current.Length - index - 1);
                Subscriptions = next;
            }

            public void Clear()
            {
                Subscription<T>[] current = Subscriptions;
                for (int i = 0; i < current.Length; i++)
                {
                    current[i].IsActive = false;
                }

                Subscriptions = Array.Empty<Subscription<T>>();
            }
        }

        private sealed class Subscription<T>
        {
            public Subscription(Action<T> handler)
            {
                Handler = handler;
                IsActive = true;
            }

            public Action<T> Handler { get; }

            public bool IsActive { get; set; }
        }
    }
}
