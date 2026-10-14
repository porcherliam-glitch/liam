using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Action "Dialog/Name bekannt" (GDD 02, 12.7 and 12.10 n030 <c>Name bekannt(harrik)</c>): from now on the subtitles show
    /// the name of the NPC instead of its role ("Harrik" instead of "Banditenanfuehrer"). Stored in the save section
    /// <c>dialogue</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Name bekannt", 1)]
    public sealed class RevealName : GameAction
    {
        [Tooltip("NPC-ID. Leer = der Gesprächspartner.")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public RevealName()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="npcId">NPC id; empty = the conversation partner.</param>
        public RevealName(string npcId)
        {
            this.npcId = npcId ?? string.Empty;
        }

        /// <summary>NPC id; empty = the conversation partner.</summary>
        public string NpcId => npcId ?? string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            string target = NpcId.Length > 0 ? NpcId : ctx.TargetId;
            if (string.IsNullOrEmpty(target))
            {
                return;
            }

            ctx.Get<IDialogueMemory>().RevealName(target);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Name bekannt: " + (NpcId.Length > 0 ? NpcId : "Gesprächspartner");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (NpcId.Length > 0)
            {
                report.Mentions(NpcId, DialogueIds.NpcPrefix);
            }
        }
    }
}
