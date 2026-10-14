using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Action "Dialog/Thema freischalten" (GDD 02, 12.9 and 12.10 n050: <c>Thema freischalten(thema.grimmbart)</c>): the topic
    /// becomes known; sends <c>TopicUnlocked</c> the first time. Also usable in quests (stolen tribute book).
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Thema freischalten", 0)]
    public sealed class UnlockTopic : GameAction
    {
        [Tooltip("Themen-ID, z. B. thema.grimmbart.")]
        [SerializeField] private string topicId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public UnlockTopic()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="topicId">Topic id.</param>
        public UnlockTopic(string topicId)
        {
            this.topicId = topicId ?? string.Empty;
        }

        /// <summary>Topic id.</summary>
        public string TopicId => topicId ?? string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IDialogueMemory>().UnlockTopic(topicId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Thema " + (TopicId.Length > 0 ? TopicId : "?") + " freischalten";
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
