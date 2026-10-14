using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Helpers for <see cref="Condition.CollectTriggers"/> of logic types (architecture 7.2, 7.5). Stateless.
    /// </summary>
    public static class TriggerCollectorExtensions
    {
        /// <summary>
        /// Collects the triggers of an entry of a logic type (AND, OR, NOT, n of m). If the entry declares nothing, the whole
        /// condition is polled (<see cref="ITriggerCollector.Poll"/>) - otherwise a sibling's event would hide that the entry
        /// can change without an event. An empty entry (null, unknown type) never changes and counts as constant.
        /// </summary>
        /// <param name="triggers">Collector of the logic type.</param>
        /// <param name="child">Entry or null.</param>
        public static void CollectChild(this ITriggerCollector triggers, Condition child)
        {
            if (triggers == null)
            {
                return;
            }

            if (child == null)
            {
                triggers.Constant();
                return;
            }

            var probe = new Probe(triggers);
            child.CollectTriggers(probe);
            if (!probe.Declared)
            {
                triggers.Poll();
            }
        }

        private sealed class Probe : ITriggerCollector
        {
            private readonly ITriggerCollector _inner;

            public Probe(ITriggerCollector inner)
            {
                _inner = inner;
            }

            public bool Declared { get; private set; }

            public void On<T>() where T : struct, IGameEvent
            {
                Declared = true;
                _inner.On<T>();
            }

            public void OnFlag(string flagId)
            {
                Declared = true;
                _inner.OnFlag(flagId);
            }

            public void OnGameHour()
            {
                Declared = true;
                _inner.OnGameHour();
            }

            public void Constant()
            {
                Declared = true;
                _inner.Constant();
            }

            public void Poll()
            {
                Declared = true;
                _inner.Poll();
            }
        }
    }
}
