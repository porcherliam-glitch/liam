using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Records the triggers a condition declares (<see cref="Condition.CollectTriggers"/>) without subscribing anything. Used by
    /// validators ("condition without trigger is polled") and tests.
    /// </summary>
    public sealed class TriggerSet : ITriggerCollector
    {
        private readonly List<Type> _eventTypes = new List<Type>();
        private readonly List<string> _flagIds = new List<string>();

        /// <summary>Declared event types (each once).</summary>
        public IReadOnlyList<Type> EventTypes => _eventTypes;

        /// <summary>Declared flag ids (each once).</summary>
        public IReadOnlyList<string> FlagIds => _flagIds;

        /// <summary>True if the game hour was declared.</summary>
        public bool Hourly { get; private set; }

        /// <summary>True if the condition declared itself constant.</summary>
        public bool IsConstant { get; private set; }

        /// <summary>True if nothing was declared: the watcher would poll this condition once per second.</summary>
        public bool IsEmpty => _eventTypes.Count == 0 && _flagIds.Count == 0 && !Hourly && !IsConstant && !NeedsPolling;

        /// <summary>True if polling was requested (an entry of a logic type declares no trigger).</summary>
        public bool NeedsPolling { get; private set; }

        /// <summary>True if the watcher polls the condition once per second (nothing declared or polling requested).</summary>
        public bool IsPolled => IsEmpty || NeedsPolling;

        /// <summary>Collects the triggers of a condition (null = nothing).</summary>
        /// <param name="condition">Condition.</param>
        public static TriggerSet Of(Condition condition)
        {
            var set = new TriggerSet();
            if (condition != null)
            {
                condition.CollectTriggers(set);
            }

            return set;
        }

        /// <summary>True if the event type was declared.</summary>
        /// <typeparam name="T">Event type.</typeparam>
        public bool Contains<T>() where T : struct, IGameEvent
        {
            return _eventTypes.Contains(typeof(T));
        }

        /// <inheritdoc />
        public void On<T>() where T : struct, IGameEvent
        {
            if (!_eventTypes.Contains(typeof(T)))
            {
                _eventTypes.Add(typeof(T));
            }
        }

        /// <inheritdoc />
        public void OnFlag(string flagId)
        {
            if (!string.IsNullOrEmpty(flagId) && !_flagIds.Contains(flagId))
            {
                _flagIds.Add(flagId);
            }
        }

        /// <inheritdoc />
        public void OnGameHour()
        {
            Hourly = true;
        }

        /// <inheritdoc />
        public void Constant()
        {
            IsConstant = true;
        }

        /// <inheritdoc />
        public void Poll()
        {
            NeedsPolling = true;
        }
    }
}
