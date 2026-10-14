namespace Aetherfall.Quests
{
    /// <summary>
    /// An objective that waits for a condition instead of an event (GDD 02 5.2 "Bedingungs-Ziel"). Registered with
    /// <see cref="IObjectiveEventRegistry.WatchCondition"/>; called once with the current value when the stage starts and
    /// again whenever the value changes (condition watcher, architecture 7.5).
    /// </summary>
    public interface IObjectiveConditionListener
    {
        /// <summary>Handles a (new) value of the watched condition.</summary>
        /// <param name="isMet">True if the condition holds.</param>
        /// <param name="rt">Run-time state of this objective.</param>
        /// <param name="ctx">Quest context.</param>
        void OnConditionChanged(bool isMet, ObjectiveRuntime rt, in QuestContext ctx);
    }
}
