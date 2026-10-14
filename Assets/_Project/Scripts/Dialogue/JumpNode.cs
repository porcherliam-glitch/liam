using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Jump (GDD 02, 12.2 "Sprung"): continues at a node of this or another dialogue (topic hub, trader sub dialogue). With
    /// "return" the conversation comes back to the return node of this dialogue when the other dialogue reaches its end.
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Sprung", 6)]
    public sealed class JumpNode : DialogueNode
    {
        /// <summary>Deepest nesting of jumps with return.</summary>
        public const int MaxReturnDepth = 4;

        [Tooltip("Ziel-Dialog. Leer = dieser Dialog.")]
        [IdRef("dlg.")] [SerializeField] private string targetDialogueId = string.Empty;

        [Tooltip("Ziel-Knoten. Leer = Start-Knoten des Ziel-Dialogs.")]
        [SerializeField] private string targetNodeId = string.Empty;

        [Tooltip("Rückkehr: Endet der Ziel-Dialog, geht es hier beim Rückkehr-Knoten weiter (statt das Gespräch zu beenden).")]
        [SerializeField] private bool returnAfter;

        [Tooltip("Rückkehr-Knoten in diesem Dialog (nur mit Rückkehr).")]
        [SerializeField] private string returnNodeId = string.Empty;

        /// <summary>Creates an empty jump (inspector).</summary>
        public JumpNode()
        {
        }

        /// <summary>Creates a jump.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="targetDialogueId">Target dialogue; empty = this dialogue.</param>
        /// <param name="targetNodeId">Target node; empty = start node.</param>
        public JumpNode(string id, string targetDialogueId, string targetNodeId) : base(id)
        {
            this.targetDialogueId = targetDialogueId ?? string.Empty;
            this.targetNodeId = targetNodeId ?? string.Empty;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Jump;

        /// <summary>Target dialogue; empty = this dialogue.</summary>
        public string TargetDialogueId => targetDialogueId ?? string.Empty;

        /// <summary>Target node; empty = start node of the target dialogue.</summary>
        public string TargetNodeId => targetNodeId ?? string.Empty;

        /// <summary>True if the conversation returns after the target dialogue ended.</summary>
        public bool ReturnAfter => returnAfter;

        /// <summary>Return node in this dialogue.</summary>
        public string ReturnNodeId => returnNodeId ?? string.Empty;

        /// <summary>True if the target is another dialogue.</summary>
        public bool IsExternal => !string.IsNullOrEmpty(targetDialogueId);

        /// <summary>Returns here after the target dialogue ended (chainable).</summary>
        /// <param name="nodeId">Return node in this dialogue.</param>
        public JumpNode ReturnTo(string nodeId)
        {
            returnAfter = true;
            returnNodeId = nodeId ?? string.Empty;
            return this;
        }

        /// <inheritdoc />
        public override bool CanEndHere => IsExternal && !returnAfter;

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            if (!IsExternal)
            {
                AddTarget(targets, targetNodeId);
            }

            if (returnAfter)
            {
                AddTarget(targets, returnNodeId);
            }
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (!IsExternal && string.IsNullOrEmpty(targetNodeId))
            {
                report.Error(DialogueValidator.DeadEndCode, "Sprung ohne Ziel: Ziel-Dialog oder Ziel-Knoten angeben.");
            }

            if (IsExternal)
            {
                report.Mentions(targetDialogueId, DialogueIds.DialoguePrefix);
            }

            if (returnAfter && string.IsNullOrEmpty(returnNodeId))
            {
                report.Error(DialogueValidator.DeadEndCode, "Sprung mit Rückkehr, aber ohne Rückkehr-Knoten.");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Sprung → " + (IsExternal ? targetDialogueId + (targetNodeId.Length > 0 ? "/" + targetNodeId : string.Empty) : targetNodeId) +
                   (returnAfter ? " (zurück zu " + returnNodeId + ")" : string.Empty);
        }
    }
}
