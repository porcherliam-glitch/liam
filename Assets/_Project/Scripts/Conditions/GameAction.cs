using System;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Base class of all actions (architecture 7.1, §6.4): an effect that quests, dialogues and world events run, held as
    /// <c>[SerializeReference]</c> lists (executed in list order).
    /// </summary>
    /// <remarks>
    /// <para><b>Actions take effect at once</b> (less than 1 ms). Things that take time (cutscene, NPC walking) are started
    /// and report their end by event; quests and dialogues wait for that event, never the action.</para>
    /// <para>Same rules for concrete types as for <see cref="Condition"/> (architecture 7.6).</para>
    /// </remarks>
    [Serializable]
    public abstract class GameAction
    {
        /// <summary>Runs the action. Exceptions are caught and logged by <see cref="ActionRunner"/>.</summary>
        /// <param name="ctx">Context with service access, subject and source.</param>
        public abstract void Execute(in ActionContext ctx);

        /// <summary>Short German text for lists and the editor header, e.g. <c>Setze Flag x = 1</c>.</summary>
        public virtual string Describe()
        {
            return GetType().Name;
        }

        /// <summary>Checks the data (called by the editor validator).</summary>
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
