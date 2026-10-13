using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Synchronous, typed delivery of global events (architecture 4.3). Main thread only.
    /// </summary>
    /// <remarks>
    /// Subscription discipline: MonoBehaviours subscribe in <c>OnEnable</c> and unsubscribe in <c>OnDisable</c>;
    /// services subscribe in <see cref="IPostInitializable.PostInitialize"/> and unsubscribe in <c>Dispose</c>/<c>EndSession</c>.
    /// Pass handlers as method groups (<c>bus.Subscribe&lt;GameStateChanged&gt;(OnGameStateChanged)</c>), never as
    /// anonymous lambdas that have to be unsubscribed later.
    /// </remarks>
    public interface IEventBus
    {
        /// <summary>
        /// Subscribes a handler. Subscribing the same handler (same target and method) twice is ignored with a warning.
        /// A handler subscribed during a <see cref="Publish{T}"/> receives events from the next publish on.
        /// </summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="handler">Handler to call for every published event of type <typeparamref name="T"/>.</param>
        void Subscribe<T>(Action<T> handler) where T : struct, IGameEvent;

        /// <summary>
        /// Unsubscribes a handler. Unknown handlers are ignored. A handler unsubscribed during a
        /// <see cref="Publish{T}"/> is not called anymore, not even for the event currently being delivered.
        /// </summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="handler">The handler that was passed to <see cref="Subscribe{T}"/>.</param>
        void Unsubscribe<T>(Action<T> handler) where T : struct, IGameEvent;

        /// <summary>
        /// Delivers an event synchronously to all handlers in subscription order. Allocation-free.
        /// Exceptions in handlers are logged; the remaining handlers still run. Nested publishing is allowed
        /// up to a depth of 8; deeper publishes are rejected with an error log (endless loop protection).
        /// </summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="evt">The event.</param>
        void Publish<T>(in T evt) where T : struct, IGameEvent;
    }
}
