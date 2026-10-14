using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Rede mit NPC" (GDD 02 5.1 type 5, short code <c>Rede</c>): fulfilled by <c>NPCTalkedTo</c> with the NPC,
    /// optionally only for one dialogue.
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Rede mit NPC", 4)]
    public sealed class TalkToObjective : QuestObjective, IObjectiveListener<NPCTalkedTo>
    {
        [Tooltip("NPC-ID, z. B. npc.eichental.bauer_hollmann.")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        [Tooltip("Dialog-ID (optional). Leer = jedes Gespräch mit dem NPC.")]
        [IdRef("dlg.")] [SerializeField] private string dialogueId = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public TalkToObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="dialogueId">Dialogue id or empty.</param>
        public TalkToObjective(string id, string npcId, string dialogueId = "") : base(id)
        {
            this.npcId = npcId ?? string.Empty;
            this.dialogueId = dialogueId ?? string.Empty;
        }

        /// <summary>NPC id.</summary>
        public string NpcId => npcId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "Rede";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<NPCTalkedTo>(this);
        }

        /// <inheritdoc />
        public void Handle(in NPCTalkedTo evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.NpcId != NpcId)
            {
                return;
            }

            if (!string.IsNullOrEmpty(dialogueId) && evt.DialogueId != dialogueId)
            {
                return;
            }

            rt.Complete();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + NpcId + (string.IsNullOrEmpty(dialogueId) ? string.Empty : ", " + dialogueId) + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(npcId, "npc.", "NPC");
            if (!string.IsNullOrEmpty(dialogueId))
            {
                report.Mentions(dialogueId, "dlg.");
            }
        }
    }
}
