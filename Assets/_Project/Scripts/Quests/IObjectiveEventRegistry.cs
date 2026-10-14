using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Passed to <see cref="QuestObjective.RegisterListeners"/> when a stage starts (or is restored after loading): the
    /// objective declares the events and conditions it needs. Everything is removed automatically when the stage ends.
    /// The generic call with a known event type keeps the routing free of reflection (IL2CPP-safe).
    /// </summary>
    public interface IObjectiveEventRegistry
    {
        /// <summary>Routes every event of type <typeparamref name="TEvent"/> to the listener while the stage is active.</summary>
        /// <typeparam name="TEvent">Event type.</typeparam>
        /// <param name="listener">The objective itself.</param>
        void Listen<TEvent>(IObjectiveListener<TEvent> listener) where TEvent : struct, IGameEvent;

        /// <summary>Watches a condition while the stage is active (see <see cref="IObjectiveConditionListener"/>).</summary>
        /// <param name="condition">Condition (null always holds).</param>
        /// <param name="listener">The objective itself.</param>
        void WatchCondition(Condition condition, IObjectiveConditionListener listener);
    }
}
