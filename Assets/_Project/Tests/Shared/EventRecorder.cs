using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Tests
{
    /// <summary>
    /// Subscribes to one event type on an <see cref="IEventBus"/> and records every delivered event.
    /// Dispose to unsubscribe.
    /// </summary>
    /// <typeparam name="T">Event type to record.</typeparam>
    public sealed class EventRecorder<T> : IDisposable where T : struct, IGameEvent
    {
        private readonly IEventBus _bus;
        private readonly List<T> _events = new List<T>();
        private bool _disposed;

        /// <summary>Starts recording.</summary>
        /// <param name="bus">Bus to subscribe to.</param>
        public EventRecorder(IEventBus bus)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            _bus.Subscribe<T>(OnEvent);
        }

        /// <summary>Recorded events in delivery order.</summary>
        public IReadOnlyList<T> Events => _events;

        /// <summary>Number of recorded events.</summary>
        public int Count => _events.Count;

        /// <summary>The most recent event; throws if none was recorded.</summary>
        public T Last => _events[_events.Count - 1];

        /// <summary>Forgets all recorded events.</summary>
        public void Clear()
        {
            _events.Clear();
        }

        /// <summary>Stops recording.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _bus.Unsubscribe<T>(OnEvent);
        }

        private void OnEvent(T evt)
        {
            _events.Add(evt);
        }
    }
}
