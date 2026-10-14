using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Condition "Dialog/Probe bestanden": a remembered skill check of a dialogue succeeded (or, with "erwartet Misserfolg",
    /// failed). Only checks with "Ergebnis merken" are stored. Re-evaluated on <c>SkillCheckResolved</c> and after loading.
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Probe bestanden", 2)]
    public sealed class CheckSucceeded : Condition
    {
        [Tooltip("Dialog-ID.")]
        [IdRef("dlg.")] [SerializeField] private string dialogueId = string.Empty;

        [Tooltip("Knoten-ID der Probe, z. B. n100.")]
        [SerializeField] private string nodeId = string.Empty;

        [Tooltip("An: erfüllt, wenn die Probe gescheitert ist (statt bestanden).")]
        [SerializeField] private bool expectFailure;

        /// <summary>Creates an empty condition (inspector).</summary>
        public CheckSucceeded()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="nodeId">Node id of the check.</param>
        /// <param name="expectFailure">True = holds if the check failed.</param>
        public CheckSucceeded(string dialogueId, string nodeId, bool expectFailure = false)
        {
            this.dialogueId = dialogueId ?? string.Empty;
            this.nodeId = nodeId ?? string.Empty;
            this.expectFailure = expectFailure;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IDialogueMemory>().TryGetCheckResult(dialogueId, nodeId, out bool success) && success != expectFailure;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<SkillCheckResolved>();
            triggers.On<GameLoaded>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Probe " + DialogueIds.NodeKey(dialogueId, nodeId) + (expectFailure ? " gescheitert" : " bestanden");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(dialogueId, DialogueIds.DialoguePrefix, "Dialog-ID");
            if (string.IsNullOrEmpty(nodeId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Knoten-ID ist leer.");
            }
        }
    }
}
