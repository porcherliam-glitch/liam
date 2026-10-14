using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// A node that continues on its own after it was handled (NPC line, action): either to the next node or, without a next
    /// node, to the end of the conversation with an exit id (GDD 02, 12.10: "Weiter: Ende <c>abzug</c>").
    /// </summary>
    [Serializable]
    public abstract class FlowNode : DialogueNode
    {
        [Tooltip("Nächster Knoten. Leer = das Gespräch endet hier mit dem Ausgang darunter.")]
        [SerializeField] private string nextNodeId = string.Empty;

        [Tooltip("Ausgangs-ID, wenn kein nächster Knoten folgt, z. B. abzug. Wird als DialogOutcome gemeldet (Ziel „Überzeuge“).")]
        [SerializeField] private string exitId = string.Empty;

        [Tooltip("Folgeaktion nach dem Ende: Gameplay, Handel öffnen oder Kampf.")]
        [SerializeField] private DialogueFollowUp followUp = DialogueFollowUp.Gameplay;

        /// <summary>Creates an empty node (inspector).</summary>
        protected FlowNode()
        {
        }

        /// <summary>Creates a node with an id.</summary>
        /// <param name="id">Node id.</param>
        protected FlowNode(string id) : base(id)
        {
        }

        /// <summary>Next node; empty if the conversation ends here.</summary>
        public string NextNodeId => nextNodeId ?? string.Empty;

        /// <summary>Exit id when the conversation ends after this node.</summary>
        public string ExitId => exitId ?? string.Empty;

        /// <summary>Follow-up when the conversation ends after this node.</summary>
        public DialogueFollowUp FollowUp => followUp;

        /// <summary>True if no next node is set (the conversation ends after this node).</summary>
        public bool EndsAfter => string.IsNullOrEmpty(nextNodeId);

        /// <inheritdoc />
        public override bool CanEndHere => EndsAfter && !string.IsNullOrEmpty(exitId);

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            AddTarget(targets, nextNodeId);
        }

        /// <summary>Sets the next node (chainable; test data and generators).</summary>
        /// <param name="nodeId">Next node id.</param>
        protected void SetNext(string nodeId)
        {
            nextNodeId = nodeId ?? string.Empty;
        }

        /// <summary>Lets the conversation end after this node (chainable; test data and generators).</summary>
        /// <param name="exit">Exit id.</param>
        /// <param name="followUpAction">Follow-up.</param>
        protected void SetEnd(string exit, DialogueFollowUp followUpAction)
        {
            nextNodeId = string.Empty;
            exitId = exit ?? string.Empty;
            followUp = followUpAction;
        }

        /// <summary>Text of the continuation for <see cref="DialogueNode.Describe"/>.</summary>
        protected string DescribeContinuation()
        {
            if (!EndsAfter)
            {
                return "→ " + nextNodeId;
            }

            return "→ Ende " + (string.IsNullOrEmpty(exitId) ? "?" : exitId) + (followUp != DialogueFollowUp.Gameplay ? " (" + followUp + ")" : string.Empty);
        }
    }
}
