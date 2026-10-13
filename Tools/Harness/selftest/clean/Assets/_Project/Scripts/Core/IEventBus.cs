using System;

namespace Aetherfall.Core
{
    /// <summary>Synchronous, typed delivery of global game events.</summary>
    public interface IEventBus
    {
        /// <summary>Adds a handler for events of type <typeparamref name="T"/>.</summary>
        void Subscribe<T>(Action<T> handler) where T : struct, IGameEvent;

        /// <summary>Removes a handler that was added with <see cref="Subscribe{T}"/>.</summary>
        void Unsubscribe<T>(Action<T> handler) where T : struct, IGameEvent;

        /// <summary>Delivers the event to all current handlers, in subscription order.</summary>
        void Publish<T>(in T evt) where T : struct, IGameEvent;
    }
}
