using System;
using System.Collections.Generic;
using System.Diagnostics;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Default <see cref="IConditionWatcher"/> (architecture 7.5). Pure logic on top of <see cref="IEventBus"/>: each event
    /// type is subscribed once (when the first watch declares it), an event marks only the watches that declared it as dirty,
    /// <see cref="Tick"/> evaluates dirty watches until the time budget (default 0.5 ms) is used up and continues in the next
    /// frame. <c>FlagChanged</c> is filtered by flag id, <c>TimeOfDayChanged</c> by a change of the hour. Watches without
    /// triggers, and watches whose AND/OR/NOT contains an entry without triggers (<see cref="ITriggerCollector.Poll"/>), are
    /// polled every second (in addition to their events).
    /// </summary>
    /// <remarks>
    /// Callbacks run only when the value changed and never during <see cref="Watch"/>. A throwing condition counts as false,
    /// a throwing callback is logged; neither stops the other watches. Ticked by the central <c>TickRunner</c> (early in the
    /// frame, so changes of frame n are seen in frame n + 1). Main thread only.
    /// </remarks>
    public sealed class ConditionWatcher : IConditionWatcher, ITickable, IDisposable
    {
        /// <summary>Default polling interval of watches without triggers (architecture 7.5: 1 s).</summary>
        public const float DefaultPollIntervalSeconds = 1f;

        /// <summary>Default evaluation budget per frame in milliseconds (architecture 7.5: 0.5 ms).</summary>
        public const double DefaultBudgetMilliseconds = 0.5;

        private readonly IEventBus _bus;
        private readonly float _pollInterval;
        private readonly double _budgetMilliseconds;
        private readonly Dictionary<int, Entry> _entries = new Dictionary<int, Entry>();
        private readonly Dictionary<Type, IChannel> _channels = new Dictionary<Type, IChannel>();
        private readonly Dictionary<string, List<Entry>> _flagWatches = new Dictionary<string, List<Entry>>(StringComparer.Ordinal);
        private readonly List<Entry> _hourWatches = new List<Entry>();
        private readonly List<Entry> _polledWatches = new List<Entry>();
        private readonly Queue<Entry> _dirty = new Queue<Entry>();
        private readonly Collector _collector;
        private readonly Stopwatch _stopwatch = new Stopwatch();
        private bool _flagSubscribed;
        private bool _hourSubscribed;
        private int _lastHour = -1;
        private float _pollTimer;
        private int _nextId = 1;
        private bool _disposed;

        /// <summary>Creates the watcher.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="pollIntervalSeconds">Polling interval of watches without triggers.</param>
        /// <param name="budgetMilliseconds">Evaluation budget per <see cref="Tick"/>; at least one watch is evaluated.</param>
        public ConditionWatcher(IEventBus bus, float pollIntervalSeconds = DefaultPollIntervalSeconds, double budgetMilliseconds = DefaultBudgetMilliseconds)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            _pollInterval = pollIntervalSeconds > 0f ? pollIntervalSeconds : DefaultPollIntervalSeconds;
            _budgetMilliseconds = budgetMilliseconds > 0.0 ? budgetMilliseconds : DefaultBudgetMilliseconds;
            _collector = new Collector(this);
        }

        private interface IChannel
        {
            void Remove(Entry entry);

            void Unsubscribe();
        }

        /// <inheritdoc />
        public int WatchCount => _entries.Count;

        /// <inheritdoc />
        public int PendingCount => _dirty.Count;

        /// <summary>Number of watches polled once per second (no triggers, or an entry of a logic type without triggers).</summary>
        public int PolledWatchCount => _polledWatches.Count;

        /// <summary>Number of event types the watcher subscribed to (each exactly once).</summary>
        public int SubscribedEventTypeCount => _channels.Count + (_flagSubscribed ? 1 : 0) + (_hourSubscribed ? 1 : 0);

        /// <summary>
        /// True once a <c>TimeOfDayChanged</c> event arrived. Until then (no game clock yet) watches that declared
        /// <see cref="ITriggerCollector.OnGameHour"/> are polled once per interval like watches without triggers.
        /// </summary>
        public bool HasGameClock => _lastHour >= 0;

        /// <inheritdoc />
        public int Watch(Condition condition, in ConditionContext ctx, Action<bool> onChanged)
        {
            ThrowIfDisposed();
            var entry = new Entry(_nextId++, condition, ctx, onChanged);
            _entries.Add(entry.Id, entry);

            _collector.Begin(entry);
            if (condition != null)
            {
                try
                {
                    condition.CollectTriggers(_collector);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Quests, exception, "CollectTriggers of " + condition.GetType().Name + " failed; the condition is polled");
                }
            }
            else
            {
                _collector.Constant();
            }

            if (!_collector.End(out bool pollRequested) || pollRequested)
            {
                entry.Polled = true;
                _polledWatches.Add(entry);
            }

            entry.Value = ConditionEvaluator.IsMet(condition, entry.Context);
            return entry.Id;
        }

        /// <inheritdoc />
        public void Unwatch(int watchId)
        {
            if (!_entries.TryGetValue(watchId, out Entry entry))
            {
                return;
            }

            _entries.Remove(watchId);
            entry.Active = false;
            for (int i = 0; i < entry.Channels.Count; i++)
            {
                entry.Channels[i].Remove(entry);
            }

            entry.Channels.Clear();
            for (int i = 0; i < entry.Flags.Count; i++)
            {
                if (_flagWatches.TryGetValue(entry.Flags[i], out List<Entry> list))
                {
                    list.Remove(entry);
                    if (list.Count == 0)
                    {
                        _flagWatches.Remove(entry.Flags[i]);
                    }
                }
            }

            if (entry.Hourly)
            {
                _hourWatches.Remove(entry);
            }

            if (entry.Polled)
            {
                _polledWatches.Remove(entry);
            }
        }

        /// <inheritdoc />
        public bool IsMet(int watchId)
        {
            return _entries.TryGetValue(watchId, out Entry entry) && entry.Value;
        }

        /// <inheritdoc />
        public bool IsWatching(int watchId)
        {
            return _entries.ContainsKey(watchId);
        }

        /// <inheritdoc />
        public void MarkAllDirty()
        {
            foreach (Entry entry in _entries.Values)
            {
                MarkDirty(entry);
            }
        }

        /// <inheritdoc />
        public int EvaluatePending()
        {
            int evaluated = 0;
            int guard = 10000 + (_entries.Count * 10);
            while (_dirty.Count > 0)
            {
                if (evaluated >= guard)
                {
                    Log.Error(LogCategory.Quests, "ConditionWatcher: more than " + guard + " evaluations in one pass (callbacks keep changing each other); the rest waits for the next tick.");
                    break;
                }

                EvaluateNext();
                evaluated++;
            }

            return evaluated;
        }

        /// <summary>Polls watches without triggers when due and evaluates dirty watches within the budget.</summary>
        /// <param name="deltaTime">Frame time in seconds (scaled; polling pauses while the game is paused).</param>
        public void Tick(float deltaTime)
        {
            if (_disposed)
            {
                return;
            }

            _pollTimer += deltaTime;
            if (_pollTimer >= _pollInterval)
            {
                _pollTimer = 0f;
                for (int i = 0; i < _polledWatches.Count; i++)
                {
                    MarkDirty(_polledWatches[i]);
                }

                if (!HasGameClock)
                {
                    // Fallback until the game clock sends TimeOfDayChanged (game clock step, architecture 4.6): conditions
                    // that wait for time to pass (FlagAge) are polled like conditions without triggers.
                    MarkDirty(_hourWatches);
                }
            }

            if (_dirty.Count == 0)
            {
                return;
            }

            _stopwatch.Restart();
            do
            {
                EvaluateNext();
            }
            while (_dirty.Count > 0 && _stopwatch.Elapsed.TotalMilliseconds < _budgetMilliseconds);

            _stopwatch.Stop();
        }

        /// <summary>Unsubscribes from all events and forgets every watch.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            foreach (IChannel channel in _channels.Values)
            {
                channel.Unsubscribe();
            }

            if (_flagSubscribed)
            {
                _bus.Unsubscribe<FlagChanged>(OnFlagChanged);
            }

            if (_hourSubscribed)
            {
                _bus.Unsubscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
            }

            foreach (Entry entry in _entries.Values)
            {
                entry.Active = false;
            }

            _channels.Clear();
            _entries.Clear();
            _flagWatches.Clear();
            _hourWatches.Clear();
            _polledWatches.Clear();
            _dirty.Clear();
        }

        private void EvaluateNext()
        {
            Entry entry = _dirty.Dequeue();
            entry.Dirty = false;
            if (!entry.Active)
            {
                return;
            }

            bool value = ConditionEvaluator.IsMet(entry.Condition, entry.Context);
            if (value == entry.Value)
            {
                return;
            }

            entry.Value = value;
            if (entry.Callback == null)
            {
                return;
            }

            try
            {
                entry.Callback(value);
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "ConditionWatcher callback of watch " + entry.Id + " (source '" + entry.Context.SourceId + "') failed");
            }
        }

        private void MarkDirty(Entry entry)
        {
            if (!entry.Active || entry.Dirty)
            {
                return;
            }

            entry.Dirty = true;
            _dirty.Enqueue(entry);
        }

        private void MarkDirty(List<Entry> entries)
        {
            for (int i = 0; i < entries.Count; i++)
            {
                MarkDirty(entries[i]);
            }
        }

        private void AddToChannel<T>(Entry entry) where T : struct, IGameEvent
        {
            if (!_channels.TryGetValue(typeof(T), out IChannel channel))
            {
                channel = new Channel<T>(this, _bus);
                _channels.Add(typeof(T), channel);
            }

            if (entry.Channels.Contains(channel))
            {
                return;
            }

            ((Channel<T>)channel).Add(entry);
            entry.Channels.Add(channel);
        }

        private void AddFlag(Entry entry, string flagId)
        {
            if (string.IsNullOrEmpty(flagId) || entry.Flags.Contains(flagId))
            {
                return;
            }

            if (!_flagSubscribed)
            {
                _bus.Subscribe<FlagChanged>(OnFlagChanged);
                _flagSubscribed = true;
            }

            if (!_flagWatches.TryGetValue(flagId, out List<Entry> list))
            {
                list = new List<Entry>();
                _flagWatches.Add(flagId, list);
            }

            list.Add(entry);
            entry.Flags.Add(flagId);
        }

        private void AddHour(Entry entry)
        {
            if (entry.Hourly)
            {
                return;
            }

            if (!_hourSubscribed)
            {
                _bus.Subscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
                _hourSubscribed = true;
            }

            entry.Hourly = true;
            _hourWatches.Add(entry);
        }

        private void OnFlagChanged(FlagChanged evt)
        {
            if (_flagWatches.TryGetValue(evt.FlagId, out List<Entry> list))
            {
                MarkDirty(list);
            }
        }

        private void OnTimeOfDayChanged(TimeOfDayChanged evt)
        {
            if (evt.Hour == _lastHour)
            {
                return;
            }

            _lastHour = evt.Hour;
            MarkDirty(_hourWatches);
        }

        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException(nameof(ConditionWatcher));
            }
        }

        private sealed class Entry
        {
            public Entry(int id, Condition condition, in ConditionContext context, Action<bool> callback)
            {
                Id = id;
                Condition = condition;
                Context = context;
                Callback = callback;
                Active = true;
            }

            public int Id { get; }

            public Condition Condition { get; }

            public ConditionContext Context { get; }

            public Action<bool> Callback { get; }

            public List<IChannel> Channels { get; } = new List<IChannel>();

            public List<string> Flags { get; } = new List<string>();

            public bool Value { get; set; }

            public bool Dirty { get; set; }

            public bool Active { get; set; }

            public bool Polled { get; set; }

            public bool Hourly { get; set; }
        }

        private sealed class Channel<T> : IChannel where T : struct, IGameEvent
        {
            private readonly ConditionWatcher _owner;
            private readonly IEventBus _bus;
            private readonly List<Entry> _entries = new List<Entry>();

            public Channel(ConditionWatcher owner, IEventBus bus)
            {
                _owner = owner;
                _bus = bus;
                _bus.Subscribe<T>(OnEvent);
            }

            public void Add(Entry entry)
            {
                _entries.Add(entry);
            }

            public void Remove(Entry entry)
            {
                _entries.Remove(entry);
            }

            public void Unsubscribe()
            {
                _bus.Unsubscribe<T>(OnEvent);
                _entries.Clear();
            }

            private void OnEvent(T evt)
            {
                _owner.MarkDirty(_entries);
            }
        }

        private sealed class Collector : ITriggerCollector
        {
            private readonly ConditionWatcher _owner;
            private Entry _entry;
            private bool _declared;
            private bool _poll;

            public Collector(ConditionWatcher owner)
            {
                _owner = owner;
            }

            public void Begin(Entry entry)
            {
                _entry = entry;
                _declared = false;
                _poll = false;
            }

            public bool End(out bool pollRequested)
            {
                _entry = null;
                pollRequested = _poll;
                return _declared;
            }

            public void On<T>() where T : struct, IGameEvent
            {
                _declared = true;
                if (_entry != null)
                {
                    _owner.AddToChannel<T>(_entry);
                }
            }

            public void OnFlag(string flagId)
            {
                _declared = true;
                if (_entry != null)
                {
                    _owner.AddFlag(_entry, flagId);
                }
            }

            public void OnGameHour()
            {
                _declared = true;
                if (_entry != null)
                {
                    _owner.AddHour(_entry);
                }
            }

            public void Constant()
            {
                _declared = true;
            }

            public void Poll()
            {
                _declared = true;
                _poll = true;
            }
        }
    }
}
