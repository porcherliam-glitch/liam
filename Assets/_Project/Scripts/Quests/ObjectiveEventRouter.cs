using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Routes global events to the objectives of active stages (architecture 11.7 "ObjectiveEventRouter"): every event type
    /// is subscribed once (on first use), the listener list per type is copy-on-write, so stage changes during the delivery
    /// of an event neither break the loop nor let a new stage receive the event that finished the old one.
    /// </summary>
    internal sealed class ObjectiveEventRouter : IDisposable
    {
        private readonly IEventBus _bus;
        private readonly QuestService _service;
        private readonly Dictionary<Type, IChannel> _channels = new Dictionary<Type, IChannel>();

        public ObjectiveEventRouter(IEventBus bus, QuestService service)
        {
            _bus = bus;
            _service = service;
        }

        internal interface IChannel
        {
            int Count { get; }

            void Remove(ObjectiveBinding binding);

            void Unsubscribe();
        }

        public int ChannelCount => _channels.Count;

        public int ListenerCount<TEvent>() where TEvent : struct, IGameEvent
        {
            return _channels.TryGetValue(typeof(TEvent), out IChannel channel) ? channel.Count : 0;
        }

        public void Add<TEvent>(ObjectiveBinding binding, IObjectiveListener<TEvent> listener) where TEvent : struct, IGameEvent
        {
            if (!_channels.TryGetValue(typeof(TEvent), out IChannel channel))
            {
                channel = new Channel<TEvent>(_bus, _service);
                _channels.Add(typeof(TEvent), channel);
            }

            ((Channel<TEvent>)channel).Add(binding, listener);
            if (!binding.Channels.Contains(channel))
            {
                binding.Channels.Add(channel);
            }
        }

        public void Remove(ObjectiveBinding binding)
        {
            for (int i = 0; i < binding.Channels.Count; i++)
            {
                binding.Channels[i].Remove(binding);
            }

            binding.Channels.Clear();
        }

        public void Dispose()
        {
            foreach (IChannel channel in _channels.Values)
            {
                channel.Unsubscribe();
            }

            _channels.Clear();
        }

        private sealed class Channel<TEvent> : IChannel where TEvent : struct, IGameEvent
        {
            private readonly IEventBus _bus;
            private readonly QuestService _service;
            private Entry[] _entries = Array.Empty<Entry>();

            public Channel(IEventBus bus, QuestService service)
            {
                _bus = bus;
                _service = service;
                _bus.Subscribe<TEvent>(OnEvent);
            }

            public int Count => _entries.Length;

            public void Add(ObjectiveBinding binding, IObjectiveListener<TEvent> listener)
            {
                var copy = new Entry[_entries.Length + 1];
                Array.Copy(_entries, copy, _entries.Length);
                copy[_entries.Length] = new Entry(binding, listener);
                _entries = copy;
            }

            public void Remove(ObjectiveBinding binding)
            {
                int keep = 0;
                for (int i = 0; i < _entries.Length; i++)
                {
                    if (_entries[i].Binding != binding)
                    {
                        keep++;
                    }
                }

                if (keep == _entries.Length)
                {
                    return;
                }

                var copy = keep == 0 ? Array.Empty<Entry>() : new Entry[keep];
                int index = 0;
                for (int i = 0; i < _entries.Length; i++)
                {
                    if (_entries[i].Binding != binding)
                    {
                        copy[index++] = _entries[i];
                    }
                }

                _entries = copy;
            }

            public void Unsubscribe()
            {
                _bus.Unsubscribe<TEvent>(OnEvent);
                _entries = Array.Empty<Entry>();
            }

            private void OnEvent(TEvent evt)
            {
                Entry[] entries = _entries;
                for (int i = 0; i < entries.Length; i++)
                {
                    if (entries[i].Binding.Active)
                    {
                        _service.Deliver(entries[i].Binding, entries[i].Listener, evt);
                    }
                }
            }

            private readonly struct Entry
            {
                public readonly ObjectiveBinding Binding;
                public readonly IObjectiveListener<TEvent> Listener;

                public Entry(ObjectiveBinding binding, IObjectiveListener<TEvent> listener)
                {
                    Binding = binding;
                    Listener = listener;
                }
            }
        }
    }
}
