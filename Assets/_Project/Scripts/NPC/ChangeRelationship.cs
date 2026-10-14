using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Action "NPC/Beziehung aendern" (architecture 7.7 <c>ChangeRelationship</c>; GDD 02 notation <c>Beziehung(npc, ±n)</c>):
    /// changes the relationship of an NPC to the player (clamped to -100 .. +100). Empty NPC id = the conversation partner.
    /// </summary>
    [Serializable]
    [TypeMenu("NPC/Beziehung ändern", 0)]
    public sealed class ChangeRelationship : GameAction
    {
        [Tooltip("NPC-ID. Leer = Gesprächspartner (im Dialog).")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        [Tooltip("Änderung, z. B. +15 oder −20.")]
        [SerializeField] private int delta = 5;

        /// <summary>Creates an empty action (inspector).</summary>
        public ChangeRelationship()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="npcId">NPC id; empty = conversation partner.</param>
        /// <param name="delta">Change.</param>
        public ChangeRelationship(string npcId, int delta)
        {
            this.npcId = npcId ?? string.Empty;
            this.delta = delta;
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            string id = string.IsNullOrEmpty(npcId) ? ctx.TargetId : npcId;
            ctx.Get<INpcService>().ChangeRelationship(id, delta, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Beziehung " + (string.IsNullOrEmpty(npcId) ? "Gesprächspartner" : npcId) + " " + (delta >= 0 ? "+" : string.Empty) + delta;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (delta == 0)
            {
                report.Warning(ValidationReportExtensions.InvalidParameterCode, "Änderung 0 wirkt nicht.");
            }

            if (!string.IsNullOrEmpty(npcId))
            {
                report.Mentions(npcId, "npc.");
            }
        }
    }
}
