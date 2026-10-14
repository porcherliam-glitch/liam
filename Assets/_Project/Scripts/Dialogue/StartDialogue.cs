using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Action "Dialog/Dialog starten" (architecture 7.7, proposal <c>StartDialogue</c>; GDD 02 notation <c>Dialog(id)</c>):
    /// starts a conversation, e.g. when a quest stage begins (<c>dlg.eichental.harrik_kapitulation</c>). Inside a running
    /// conversation use a jump node instead; a second conversation is not started (logged).
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Dialog starten", 3)]
    public sealed class StartDialogue : GameAction
    {
        [Tooltip("Dialog-ID.")]
        [IdRef("dlg.")] [SerializeField] private string dialogueId = string.Empty;

        [Tooltip("Gesprächspartner (NPC-ID). Leer = Ziel des Aufrufs (z. B. der Partner im laufenden Kontext).")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public StartDialogue()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">NPC id.</param>
        public StartDialogue(string dialogueId, string npcId)
        {
            this.dialogueId = dialogueId ?? string.Empty;
            this.npcId = npcId ?? string.Empty;
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            string partner = !string.IsNullOrEmpty(npcId) ? npcId : ctx.TargetId;
            if (!ctx.Get<IDialogueService>().TryStart(new DialogueStartRequest(dialogueId, partner, string.Empty, ctx.SourceId)))
            {
                Log.Warning(LogCategory.Dialogue, "StartDialogue: '" + dialogueId + "' could not start (source '" + ctx.SourceId + "').");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Dialog " + (string.IsNullOrEmpty(dialogueId) ? "?" : dialogueId) + " starten";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(dialogueId, DialogueIds.DialoguePrefix, "Dialog-ID");
            if (!string.IsNullOrEmpty(npcId))
            {
                report.Mentions(npcId, DialogueIds.NpcPrefix);
            }
        }
    }
}
