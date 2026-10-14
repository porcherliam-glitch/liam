using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Everything a <see cref="GameAction"/> may use while it runs (architecture 7.3). Actions reach services only through
    /// <see cref="Services"/>; <see cref="SourceId"/> goes into the write log of the world state (quest reset, GDD 02 10.3).
    /// </summary>
    public readonly struct ActionContext
    {
        /// <summary>Service access. May be null in tests that need no service.</summary>
        public readonly IServiceLocator Services;

        /// <summary>Subject: <c>player</c> (default) or an NPC id.</summary>
        public readonly string SubjectId;

        /// <summary>Optional target, e.g. the conversation partner.</summary>
        public readonly string TargetId;

        /// <summary>Running content (quest, dialogue, world event); used as write source and for "own quest".</summary>
        public readonly string SourceId;

        /// <summary>Creates the context.</summary>
        /// <param name="services">Service access.</param>
        /// <param name="subjectId">Subject; null or empty = <c>player</c>.</param>
        /// <param name="targetId">Target or empty.</param>
        /// <param name="sourceId">Source content id or empty.</param>
        public ActionContext(IServiceLocator services, string subjectId, string targetId, string sourceId)
        {
            Services = services;
            SubjectId = string.IsNullOrEmpty(subjectId) ? SubjectIds.Player : subjectId;
            TargetId = targetId ?? string.Empty;
            SourceId = sourceId ?? string.Empty;
        }

        /// <summary>Context with the player as subject.</summary>
        /// <param name="services">Service access.</param>
        /// <param name="sourceId">Source content id.</param>
        public static ActionContext ForPlayer(IServiceLocator services, string sourceId)
        {
            return new ActionContext(services, SubjectIds.Player, string.Empty, sourceId);
        }

        /// <summary>The same context as a condition context (for "if - then" actions).</summary>
        public ConditionContext ToConditionContext()
        {
            return new ConditionContext(Services, SubjectId, TargetId, SourceId);
        }

        /// <summary>Resolves a service; throws with the missing type in the message.</summary>
        /// <typeparam name="T">Service interface.</typeparam>
        public T Get<T>() where T : class
        {
            if (Services == null)
            {
                throw new System.InvalidOperationException("ActionContext has no service locator; " + typeof(T).Name + " is not available.");
            }

            return Services.Get<T>();
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ActionContext(subject " + SubjectId + ", target '" + TargetId + "', source '" + SourceId + "')";
        }
    }
}
