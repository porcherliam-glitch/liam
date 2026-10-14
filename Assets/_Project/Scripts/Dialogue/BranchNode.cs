using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Condition switch (GDD 02, 12.2 "Bedingungsweiche"): an invisible branch. The branches are checked top-down, the first
    /// true condition wins; otherwise the default exit (required, like quest rule V09).
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Bedingungsweiche", 2)]
    public sealed class BranchNode : DialogueNode
    {
        [Tooltip("Geordnete Liste Bedingung → Knoten; die erste erfüllte gewinnt.")]
        [SerializeField] private List<DialogueBranch> branches = new List<DialogueBranch>();

        [Tooltip("Standard-Ausgang, wenn keine Bedingung erfüllt ist (Pflicht).")]
        [SerializeField] private string defaultNodeId = string.Empty;

        /// <summary>Creates an empty switch (inspector).</summary>
        public BranchNode()
        {
        }

        /// <summary>Creates a switch.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="defaultNodeId">Default exit.</param>
        public BranchNode(string id, string defaultNodeId) : base(id)
        {
            this.defaultNodeId = defaultNodeId ?? string.Empty;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Branch;

        /// <summary>Branches in priority order.</summary>
        public IReadOnlyList<DialogueBranch> Branches => branches;

        /// <summary>Default exit.</summary>
        public string DefaultNodeId => defaultNodeId ?? string.Empty;

        /// <summary>Adds a branch (chainable).</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="targetNodeId">Target node.</param>
        public BranchNode When(Condition condition, string targetNodeId)
        {
            branches.Add(new DialogueBranch(condition, targetNodeId));
            return this;
        }

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            for (int i = 0; i < branches.Count; i++)
            {
                if (branches[i] != null)
                {
                    AddTarget(targets, branches[i].TargetNodeId);
                }
            }

            AddTarget(targets, defaultNodeId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(defaultNodeId))
            {
                report.Error(DialogueValidator.MissingDefaultCode, "Die Bedingungsweiche hat keinen Standard-Ausgang.");
            }

            for (int i = 0; i < branches.Count; i++)
            {
                using (report.Scope("Zweig " + (i + 1)))
                {
                    DialogueBranch branch = branches[i];
                    if (branch == null)
                    {
                        report.Error(ValidationReportExtensions.MissingTypeCode, "Leerer Zweig.");
                        continue;
                    }

                    if (branch.TargetNodeId.Length == 0)
                    {
                        report.Error(DialogueValidator.DeadEndCode, "Der Zweig hat keinen Ziel-Knoten.");
                    }

                    report.ValidateRequired(branch.Condition, "Bedingung");
                }
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Weiche (" + branches.Count + " Zweige, sonst → " + (DefaultNodeId.Length > 0 ? DefaultNodeId : "?") + ")";
        }
    }
}
