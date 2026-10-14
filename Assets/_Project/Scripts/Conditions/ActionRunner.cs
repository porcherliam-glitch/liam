using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Runs action lists in list order (architecture 7.2). A failing action is logged with the source id and the remaining
    /// actions still run; empty entries (null, unknown type) are skipped with a warning. Stateless.
    /// </summary>
    public static class ActionRunner
    {
        /// <summary>Runs all actions of the list.</summary>
        /// <param name="actions">Actions; null = nothing to do.</param>
        /// <param name="ctx">Context.</param>
        /// <returns>Number of actions that ran without exception.</returns>
        public static int Run(IReadOnlyList<GameAction> actions, in ActionContext ctx)
        {
            if (actions == null)
            {
                return 0;
            }

            int succeeded = 0;
            for (int i = 0; i < actions.Count; i++)
            {
                if (Run(actions[i], ctx))
                {
                    succeeded++;
                }
            }

            return succeeded;
        }

        /// <summary>Runs one action.</summary>
        /// <param name="action">Action; null is skipped with a warning.</param>
        /// <param name="ctx">Context.</param>
        /// <returns>True if it ran without exception.</returns>
        public static bool Run(GameAction action, in ActionContext ctx)
        {
            if (action == null)
            {
                Log.Warning(LogCategory.Quests, "Empty action (null or unknown type) skipped (source '" + ctx.SourceId + "').");
                return false;
            }

            try
            {
                action.Execute(ctx);
                return true;
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "Action " + action.GetType().Name + " failed (source '" + ctx.SourceId + "')");
                return false;
            }
        }
    }
}
