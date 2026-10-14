using System;
using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Safe evaluation of optional conditions for systems that hold them (quests, dialogues, watchers): a missing condition
    /// (null) counts as "no requirement" and holds; an exception counts as false and is logged with the source id instead of
    /// breaking the caller. Stateless.
    /// </summary>
    public static class ConditionEvaluator
    {
        /// <summary>True if the condition holds or is null.</summary>
        /// <param name="condition">Condition or null.</param>
        /// <param name="ctx">Context.</param>
        public static bool IsMet(Condition condition, in ConditionContext ctx)
        {
            if (condition == null)
            {
                return true;
            }

            return Evaluate(condition, ctx);
        }

        /// <summary>
        /// Evaluates a condition that must exist: null counts as false (an empty entry in a list, an unknown type after a
        /// renamed class) and is logged.
        /// </summary>
        /// <param name="condition">Condition.</param>
        /// <param name="ctx">Context.</param>
        public static bool Evaluate(Condition condition, in ConditionContext ctx)
        {
            if (condition == null)
            {
                Log.Warning(LogCategory.Quests, "Empty condition (null or unknown type) counts as false (source '" + ctx.SourceId + "').");
                return false;
            }

            try
            {
                return condition.Evaluate(ctx);
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "Condition " + condition.GetType().Name + " failed and counts as false (source '" + ctx.SourceId + "')");
                return false;
            }
        }
    }
}
