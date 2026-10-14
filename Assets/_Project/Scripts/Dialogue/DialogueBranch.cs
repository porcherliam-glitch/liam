using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>One entry of a <see cref="BranchNode"/>: if the condition holds, the conversation continues at the target node.</summary>
    [Serializable]
    public sealed class DialogueBranch
    {
        [Tooltip("Bedingung (UND/ODER/NICHT über „Logik/…“).")]
        [SerializeReference] private Condition condition;

        [Tooltip("Ziel-Knoten, wenn die Bedingung erfüllt ist.")]
        [SerializeField] private string targetNodeId = string.Empty;

        /// <summary>Creates an empty branch (inspector).</summary>
        public DialogueBranch()
        {
        }

        /// <summary>Creates a branch.</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="targetNodeId">Target node.</param>
        public DialogueBranch(Condition condition, string targetNodeId)
        {
            this.condition = condition;
            this.targetNodeId = targetNodeId ?? string.Empty;
        }

        /// <summary>Condition (null counts as false and is a validator error).</summary>
        public Condition Condition => condition;

        /// <summary>Target node.</summary>
        public string TargetNodeId => targetNodeId ?? string.Empty;
    }
}
