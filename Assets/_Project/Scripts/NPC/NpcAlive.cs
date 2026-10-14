using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Condition "NPC/Lebt" (architecture 7.7 proposal <c>NpcAlive</c>; GDD 02 6.6 death branches): the NPC is alive. Re-evaluated
    /// on <c>NPCDied</c> and after loading.
    /// </summary>
    [Serializable]
    [TypeMenu("NPC/Lebt", 1)]
    public sealed class NpcAlive : Condition
    {
        [Tooltip("NPC-ID. Leer = Gesprächspartner (im Dialog).")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        /// <summary>Creates an empty condition (inspector).</summary>
        public NpcAlive()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="npcId">NPC id; empty = conversation partner.</param>
        public NpcAlive(string npcId)
        {
            this.npcId = npcId ?? string.Empty;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            string id = string.IsNullOrEmpty(npcId) ? ctx.TargetId : npcId;
            return ctx.Get<INpcService>().IsAlive(id);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<NPCDied>();
            triggers.On<GameLoaded>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return (string.IsNullOrEmpty(npcId) ? "Gesprächspartner" : npcId) + " lebt";
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
