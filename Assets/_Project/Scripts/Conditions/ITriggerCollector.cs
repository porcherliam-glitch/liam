using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Receives the events that can change the result of a condition (architecture 7.5, event-driven re-evaluation). A
    /// condition declares them in <see cref="Condition.CollectTriggers"/>; the <see cref="ConditionWatcher"/> re-evaluates it
    /// only when one of them was published. A condition that declares nothing is polled once per second.
    /// </summary>
    public interface ITriggerCollector
    {
        /// <summary>Re-evaluate after every event of type <typeparamref name="T"/>.</summary>
        /// <typeparam name="T">Event type, e.g. <c>InventoryChanged</c>.</typeparam>
        void On<T>() where T : struct, IGameEvent;

        /// <summary>Re-evaluate when this flag changes (<c>FlagChanged</c> filtered by id).</summary>
        /// <param name="flagId">Flag id.</param>
        void OnFlag(string flagId);

        /// <summary>Re-evaluate when the game hour changes (<c>TimeOfDayChanged</c> with a new hour).</summary>
        void OnGameHour();

        /// <summary>
        /// The result never changes on its own (constant conditions like <c>Always</c>): no events and no polling needed.
        /// </summary>
        void Constant();
    }
}
