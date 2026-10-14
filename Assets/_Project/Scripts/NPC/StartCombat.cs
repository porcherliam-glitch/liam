using System;
using Aetherfall.Conditions;
using Aetherfall.Dialogue;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Action "NPC/Kampf beginnen" (architecture 7.7 proposal <c>SetHostility</c> / "Kampf beginnen"; GDD 02 12.10 n900: "Gruppe
    /// group.banditen_muehlbach feindlich, Kampf beginnt"): makes an NPC or a group hostile. Options that lead to it show
    /// "[Angriff]" in red (GDD 02, 12.4).
    /// </summary>
    /// <remarks>TODO (AI step): the AI listens to <see cref="INpcService.HostilityChanged"/> and attacks.</remarks>
    [Serializable]
    [TypeMenu("NPC/Kampf beginnen", 1)]
    public sealed class StartCombat : GameAction, IDialogueBadgeSource
    {
        [Tooltip("NPC-ID oder Gruppen-ID (group.…). Leer = Gesprächspartner.")]
        [SerializeField] private string targetId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public StartCombat()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="targetId">NPC or group id; empty = conversation partner.</param>
        public StartCombat(string targetId)
        {
            this.targetId = targetId ?? string.Empty;
        }

        /// <inheritdoc />
        public DialogueOptionMarks DialogueMarks => DialogueOptionMarks.Combat;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            string id = string.IsNullOrEmpty(targetId) ? ctx.TargetId : targetId;
            ctx.Get<INpcService>().SetHostile(id, true, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Kampf mit " + (string.IsNullOrEmpty(targetId) ? "Gesprächspartner" : targetId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (!string.IsNullOrEmpty(targetId) && !targetId.StartsWith("npc.", StringComparison.Ordinal) && !targetId.StartsWith("group.", StringComparison.Ordinal))
            {
                report.Warning(ValidationReportExtensions.InvalidParameterCode, "Ziel '" + targetId + "' ist weder npc.… noch group.…");
            }
        }
    }
}
