using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Condition "Dialog/Thema bekannt" (GDD 02, 12.9): the player knows a conversation topic, e.g. <c>thema.grimmbart</c>.
    /// Re-evaluated on <c>TopicUnlocked</c> and after loading.
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Thema bekannt", 0)]
    public sealed class TopicKnown : Condition
    {
        [Tooltip("Themen-ID, z. B. thema.grimmbart.")]
        [SerializeField] private string topicId = string.Empty;

        /// <summary>Creates an empty condition (inspector).</summary>
        public TopicKnown()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="topicId">Topic id.</param>
        public TopicKnown(string topicId)
        {
            this.topicId = topicId ?? string.Empty;
        }

        /// <summary>Topic id.</summary>
        public string TopicId => topicId ?? string.Empty;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IDialogueMemory>().IsTopicKnown(topicId);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<TopicUnlocked>();
            triggers.On<GameLoaded>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Thema " + (TopicId.Length > 0 ? TopicId : "?") + " bekannt";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (report.RequireId(topicId, DialogueIds.TopicPrefix, "Themen-ID") && !topicId.StartsWith(DialogueIds.TopicPrefix, StringComparison.Ordinal))
            {
                report.Warning(DialogueValidator.IdSchemaCode, "Themen-ID '" + topicId + "' beginnt nicht mit 'thema.'.");
            }
        }
    }
}
