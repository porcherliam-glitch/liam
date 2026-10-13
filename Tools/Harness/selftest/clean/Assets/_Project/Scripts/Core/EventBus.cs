using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Copy-on-write event bus: subscribing allocates, publishing does not.
    /// Pure C# (no UnityEngine calls) so it runs in plain .NET unit tests.
    /// </summary>
    public sealed class EventBus : IEventBus
    {
        private readonly Dictionary<Type, Delegate[]> _handlers = new Dictionary<Type, Delegate[]>();

        /// <inheritdoc />
        public void Subscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (handler == null)
            {
                throw new ArgumentNullException(nameof(handler));
            }

            _handlers.TryGetValue(typeof(T), out Delegate[] current);
            int length = current == null ? 0 : current.Length;
            Delegate[] next = new Delegate[length + 1];
            if (current != null)
            {
                Array.Copy(current, next, length);
            }

            next[length] = handler;
            _handlers[typeof(T)] = next;
        }

        /// <inheritdoc />
        public void Unsubscribe<T>(Action<T> handler) where T : struct, IGameEvent
        {
            if (!_handlers.TryGetValue(typeof(T), out Delegate[] current))
            {
                return;
            }

            int index = Array.IndexOf(current, handler);
            if (index < 0)
            {
                return;
            }

            Delegate[] next = new Delegate[current.Length - 1];
            Array.Copy(current, 0, next, 0, index);
            Array.Copy(current, index + 1, next, index, current.Length - index - 1);
            _handlers[typeof(T)] = next;
        }

        /// <inheritdoc />
        public void Publish<T>(in T evt) where T : struct, IGameEvent
        {
            if (!_handlers.TryGetValue(typeof(T), out Delegate[] handlers))
            {
                return;
            }

            for (int i = 0; i < handlers.Length; i++)
            {
                ((Action<T>)handlers[i])(evt);
            }
        }
    }
}
