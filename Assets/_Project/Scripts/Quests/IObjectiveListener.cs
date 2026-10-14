using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// An objective that progresses on a global event (architecture 11.7). The objective registers itself for the event in
    /// <see cref="QuestObjective.RegisterListeners"/>; the quest service routes events only to objectives of active stages.
    /// </summary>
    /// <typeparam name="TEvent">Event type, e.g. <c>EnemyKilled</c>.</typeparam>
    public interface IObjectiveListener<TEvent> where TEvent : struct, IGameEvent
    {
        /// <summary>Handles one event: check the payload and change <paramref name="rt"/> (never fields of the objective).</summary>
        /// <param name="evt">Event.</param>
        /// <param name="rt">Run-time state of this objective in this quest.</param>
        /// <param name="ctx">Quest context.</param>
        void Handle(in TEvent evt, ObjectiveRuntime rt, in QuestContext ctx);
    }
}
