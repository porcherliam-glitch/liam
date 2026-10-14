using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Condition "Dialog/Option gewaehlt": the player chose an option of a dialogue before (e.g. a later line reacts to
    /// "Ihr seid alle aus Eichental?"). Re-evaluated on <c>ChoiceMade</c> and after loading.
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Option gewählt", 1)]
    public sealed class OptionChosen : Condition
    {
        [Tooltip("Dialog-ID.")]
        [IdRef("dlg.")] [SerializeField] private string dialogueId = string.Empty;

        [Tooltip("Knoten-ID der Auswahl, z. B. n040.")]
        [SerializeField] private string nodeId = string.Empty;

        [Tooltip("Options-ID, z. B. a.")]
        [SerializeField] private string optionId = string.Empty;

        /// <summary>Creates an empty condition (inspector).</summary>
        public OptionChosen()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the choice.</param>
        /// <param name="optionId">Option id.</param>
        public OptionChosen(string dialogueId, string nodeId, string optionId)
        {
            this.dialogueId = dialogueId ?? string.Empty;
            this.nodeId = nodeId ?? string.Empty;
            this.optionId = optionId ?? string.Empty;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IDialogueMemory>().WasOptionChosen(dialogueId, nodeId, optionId);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<ChoiceMade>();
            triggers.On<GameLoaded>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Option " + DialogueIds.OptionKey(dialogueId, nodeId, optionId) + " gewählt";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(dialogueId, DialogueIds.DialoguePrefix, "Dialog-ID");
            if (string.IsNullOrEmpty(nodeId) || string.IsNullOrEmpty(optionId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Knoten-ID oder Options-ID ist leer.");
            }
        }
    }
}
