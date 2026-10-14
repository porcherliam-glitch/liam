using System;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Base class of all conditions (architecture 7.1, §6.4): a yes/no check that quests, dialogues, world events and
    /// spawners hold as <c>[SerializeReference]</c> data and that designers combine with AND/OR/NOT in the inspector.
    /// </summary>
    /// <remarks>
    /// <para>Rules for concrete types (architecture 7.6): <c>[Serializable]</c>, <c>sealed</c>, not generic, not a
    /// <c>UnityEngine.Object</c>, a parameterless constructor without logic, a German <see cref="TypeMenuAttribute"/>, no
    /// run-time state (the objects are part of shared assets), deterministic (no random). Class, namespace and assembly names
    /// are frozen from the first content asset on; rename only with <c>[MovedFrom]</c>, fields only with
    /// <c>[FormerlySerializedAs]</c>.</para>
    /// <para>Concrete types live in the assembly of the system they ask (WorldState: flags, Quests: quest status …).</para>
    /// </remarks>
    [Serializable]
    public abstract class Condition
    {
        /// <summary>Evaluates the condition. Must not change any state and must not throw for valid data.</summary>
        /// <param name="ctx">Context with service access, subject and source.</param>
        /// <returns>True if the condition holds.</returns>
        public abstract bool Evaluate(in ConditionContext ctx);

        /// <summary>
        /// Declares the events that can change the result (architecture 7.5). Default: none (the watcher then polls once per
        /// second, and the validator warns).
        /// </summary>
        /// <param name="triggers">Collector.</param>
        public virtual void CollectTriggers(ITriggerCollector triggers)
        {
        }

        /// <summary>Short German text for lists, tooltips and the editor header, e.g. <c>Flag x = 1</c>.</summary>
        public virtual string Describe()
        {
            return GetType().Name;
        }

        /// <summary>Checks the data (called by the editor validator): empty ids, invalid values, referenced ids.</summary>
        /// <param name="report">Report to add findings and references to.</param>
        public virtual void Validate(IValidationReport report)
        {
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Describe();
        }
    }
}
