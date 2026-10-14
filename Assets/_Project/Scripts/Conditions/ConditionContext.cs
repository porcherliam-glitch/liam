using Aetherfall.Core;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Everything a <see cref="Condition"/> may use while it is evaluated (architecture 7.3). Conditions reach services only
    /// through <see cref="Services"/> - the single allowed use of the service locator in data classes (architecture 4.2,
    /// rule 3).
    /// </summary>
    public readonly struct ConditionContext
    {
        /// <summary>Service access (world state, inventory, quests …). May be null in tests that need no service.</summary>
        public readonly IServiceLocator Services;

        /// <summary>Subject of the check: <c>player</c> (default) or an NPC id for NPC conditions.</summary>
        public readonly string SubjectId;

        /// <summary>Optional target, e.g. the conversation partner in a dialogue.</summary>
        public readonly string TargetId;

        /// <summary>Evaluating content (quest, dialogue, world event) for logs and for "own quest" lookups.</summary>
        public readonly string SourceId;

        /// <summary>Creates the context.</summary>
        /// <param name="services">Service access.</param>
        /// <param name="subjectId">Subject; null or empty = <c>player</c>.</param>
        /// <param name="targetId">Target or empty.</param>
        /// <param name="sourceId">Source content id or empty.</param>
        public ConditionContext(IServiceLocator services, string subjectId, string targetId, string sourceId)
        {
            Services = services;
            SubjectId = string.IsNullOrEmpty(subjectId) ? SubjectIds.Player : subjectId;
            TargetId = targetId ?? string.Empty;
            SourceId = sourceId ?? string.Empty;
        }

        /// <summary>Context with the player as subject.</summary>
        /// <param name="services">Service access.</param>
        /// <param name="sourceId">Source content id.</param>
        public static ConditionContext ForPlayer(IServiceLocator services, string sourceId)
        {
            return new ConditionContext(services, SubjectIds.Player, string.Empty, sourceId);
        }

        /// <summary>The same context as an action context (for "if - then" actions).</summary>
        public ActionContext ToActionContext()
        {
            return new ActionContext(Services, SubjectId, TargetId, SourceId);
        }

        /// <summary>Resolves a service; throws with the missing type in the message (via the locator).</summary>
        /// <typeparam name="T">Service interface.</typeparam>
        public T Get<T>() where T : class
        {
            if (Services == null)
            {
                throw new System.InvalidOperationException("ConditionContext has no service locator; " + typeof(T).Name + " is not available.");
            }

            return Services.Get<T>();
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ConditionContext(subject " + SubjectId + ", target '" + TargetId + "', source '" + SourceId + "')";
        }
    }
}
