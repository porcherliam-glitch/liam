using System;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Event-driven re-evaluation of conditions (architecture 7.5): an observer registers a condition and a callback; the
    /// watcher subscribes every event type only once, marks only the affected watches as dirty and evaluates them within a
    /// small time budget per frame. Conditions without triggers are polled once per second. Registered by
    /// <see cref="ConditionsInstaller"/>.
    /// </summary>
    /// <remarks>
    /// Users: quest availability (start conditions of quests with a giver), fail conditions of quests and stages, condition
    /// objectives, later world events, spawners and doors. Not used for dialogue options and stage branches: those are
    /// evaluated once when needed (<see cref="ConditionEvaluator"/>). Main thread only.
    /// </remarks>
    public interface IConditionWatcher
    {
        /// <summary>Number of active watches.</summary>
        int WatchCount { get; }

        /// <summary>Number of watches waiting for re-evaluation.</summary>
        int PendingCount { get; }

        /// <summary>
        /// Starts watching a condition. The current value is evaluated at once (no callback); afterwards the callback runs
        /// whenever the value changes.
        /// </summary>
        /// <param name="condition">Condition; null always holds.</param>
        /// <param name="ctx">Context used for every evaluation.</param>
        /// <param name="onChanged">Called with the new value after a change (may be null).</param>
        /// <returns>Watch id (greater than 0).</returns>
        int Watch(Condition condition, in ConditionContext ctx, Action<bool> onChanged);

        /// <summary>Stops a watch. Unknown ids are ignored.</summary>
        /// <param name="watchId">Id returned by <see cref="Watch"/>.</param>
        void Unwatch(int watchId);

        /// <summary>Last evaluated value of a watch (false for unknown ids).</summary>
        /// <param name="watchId">Watch id.</param>
        bool IsMet(int watchId);

        /// <summary>True if the watch exists.</summary>
        /// <param name="watchId">Watch id.</param>
        bool IsWatching(int watchId);

        /// <summary>Marks every watch for re-evaluation (after loading a save: "ConditionWatcher einmal komplett", 9.2).</summary>
        void MarkAllDirty();

        /// <summary>Evaluates every pending watch now, without time budget (after loading, tests).</summary>
        /// <returns>Number of evaluations.</returns>
        int EvaluatePending();
    }
}
