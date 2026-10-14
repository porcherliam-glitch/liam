using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Dialogue;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Action "NPC/Toeten (lautlos)" (GDD 02 12.10 n910: "Harrik stirbt lautlos"): the NPC dies without a fight; sends
    /// <c>NPCDied</c> with the player as killer. Options that lead to it show "[Toeten]" and need hold to confirm (GDD 05 1.4).
    /// </summary>
    /// <remarks>TODO (world step): corpse and the reaction of the other NPCs ("fliehen beim Fund der Leiche").</remarks>
    [Serializable]
    [TypeMenu("NPC/Töten (lautlos)", 2)]
    public sealed class KillNpc : GameAction, IDialogueBadgeSource
    {
        [Tooltip("NPC-ID. Leer = Gesprächspartner.")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public KillNpc()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="npcId">NPC id; empty = conversation partner.</param>
        public KillNpc(string npcId)
        {
            this.npcId = npcId ?? string.Empty;
        }

        /// <inheritdoc />
        public DialogueOptionMarks DialogueMarks => DialogueOptionMarks.Kill;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            string id = string.IsNullOrEmpty(npcId) ? ctx.TargetId : npcId;
            ctx.Get<INpcService>().MarkDead(id, ctx.SubjectId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return (string.IsNullOrEmpty(npcId) ? "Gesprächspartner" : npcId) + " töten";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (!string.IsNullOrEmpty(npcId))
            {
                report.Mentions(npcId, "npc.");
            }
        }
    }
}
