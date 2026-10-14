using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Condition "NPC/Beziehung mindestens" (architecture 7.7 <c>RelationshipAtLeast</c>, §6.4): the relationship of an NPC to
    /// the player is at least a value (e.g. 10 = Freundlich, 50 = Vertraut). Empty NPC id = the conversation partner.
    /// Re-evaluated on <c>RelationshipChanged</c> and after loading.
    /// </summary>
    [Serializable]
    [TypeMenu("NPC/Beziehung mindestens", 0)]
    public sealed class RelationshipAtLeast : Condition
    {
        [Tooltip("NPC-ID. Leer = Gesprächspartner (im Dialog).")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        [Tooltip("Mindestwert (−100 bis +100). Freundlich ab 10, Vertraut ab 50.")]
        [Range(RelationshipRules.Min, RelationshipRules.Max)] [SerializeField] private int minimum = 10;

        /// <summary>Creates an empty condition (inspector).</summary>
        public RelationshipAtLeast()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="npcId">NPC id; empty = conversation partner.</param>
        /// <param name="minimum">Minimum value.</param>
        public RelationshipAtLeast(string npcId, int minimum)
        {
            this.npcId = npcId ?? string.Empty;
            this.minimum = minimum;
        }

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            string id = string.IsNullOrEmpty(npcId) ? ctx.TargetId : npcId;
            return ctx.Get<INpcService>().GetRelationship(id) >= minimum;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<RelationshipChanged>();
            triggers.On<GameLoaded>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Beziehung " + (string.IsNullOrEmpty(npcId) ? "Gesprächspartner" : npcId) + " ≥ " + minimum;
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
