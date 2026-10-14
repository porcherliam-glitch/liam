using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// End node (GDD 02, 12.2 "Ende"): ends the conversation with an exit id (event <c>DialogOutcome</c>, quest objective
    /// "Ueberzeuge") and a follow-up (back to the game, open trade, fight). An option that leads straight here is tagged
    /// "[Ende]" (or "[Handel]" / "[Angriff]") and is chosen by B / Circle / Esc.
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Ende", 7)]
    public sealed class EndNode : DialogueNode
    {
        [Tooltip("Ausgangs-ID, z. B. vertagt oder muehlenwache (Event DialogOutcome, Quest-Ziel „Überzeuge“).")]
        [SerializeField] private string exitId = string.Empty;

        [Tooltip("Folgeaktion: Gameplay, Handel öffnen, Kampf.")]
        [SerializeField] private DialogueFollowUp followUp = DialogueFollowUp.Gameplay;

        /// <summary>Creates an empty end node (inspector).</summary>
        public EndNode()
        {
        }

        /// <summary>Creates an end node.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="exitId">Exit id.</param>
        /// <param name="followUp">Follow-up.</param>
        public EndNode(string id, string exitId, DialogueFollowUp followUp = DialogueFollowUp.Gameplay) : base(id)
        {
            this.exitId = exitId ?? string.Empty;
            this.followUp = followUp;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.End;

        /// <summary>Exit id.</summary>
        public string ExitId => exitId ?? string.Empty;

        /// <summary>Follow-up.</summary>
        public DialogueFollowUp FollowUp => followUp;

        /// <inheritdoc />
        public override bool CanEndHere => true;

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(exitId))
            {
                report.Warning(DialogueValidator.MissingExitCode, "Ende ohne Ausgangs-ID: Quests können diesen Ausgang nicht erkennen.");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Ende " + (ExitId.Length > 0 ? ExitId : "?") + (followUp != DialogueFollowUp.Gameplay ? " (" + followUp + ")" : string.Empty);
        }
    }
}
