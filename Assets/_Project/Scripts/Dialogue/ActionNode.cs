using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Action node (GDD 02, 12.2 "Aktion"): runs its actions in list order (set flags, pay gold, start a quest, begin a fight),
    /// then continues with the next node or ends the conversation with an exit id.
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Aktion", 3)]
    public sealed class ActionNode : FlowNode
    {
        [Tooltip("Aktionen in Listenreihenfolge (Welt/Flag setzen, Dialog/Bestechen, Quest/Quest starten …).")]
        [SerializeReference] private List<GameAction> actions = new List<GameAction>();

        /// <summary>Creates an empty node (inspector).</summary>
        public ActionNode()
        {
        }

        /// <summary>Creates an action node.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="nodeActions">Actions.</param>
        public ActionNode(string id, params GameAction[] nodeActions) : base(id)
        {
            if (nodeActions != null)
            {
                actions.AddRange(nodeActions);
            }
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Action;

        /// <summary>Actions in list order.</summary>
        public IReadOnlyList<GameAction> Actions => actions;

        /// <summary>Continues with a node (chainable).</summary>
        /// <param name="nodeId">Next node.</param>
        public ActionNode To(string nodeId)
        {
            SetNext(nodeId);
            return this;
        }

        /// <summary>Ends the conversation after the actions (chainable).</summary>
        /// <param name="exit">Exit id.</param>
        /// <param name="followUp">Follow-up.</param>
        public ActionNode EndWith(string exit, DialogueFollowUp followUp = DialogueFollowUp.Gameplay)
        {
            SetEnd(exit, followUp);
            return this;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (actions.Count == 0)
            {
                report.Warning(DialogueValidator.EmptyActionCode, "Der Aktions-Knoten hat keine Aktionen.");
            }

            report.ValidateActions(actions, "Aktionen");
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Aktion (" + actions.Count + ") " + DescribeContinuation();
        }
    }
}
