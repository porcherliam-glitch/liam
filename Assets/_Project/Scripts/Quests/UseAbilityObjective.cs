using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Setze Faehigkeit ein" (GDD 02 5.1 type 25, short code <c>Faehigkeit</c>; sketch of GDD 02 5.3): fulfilled by
    /// <c>AbilityUsedAt</c> with the ability at the target (any target if the target is empty).
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Fähigkeit einsetzen", 11)]
    public sealed class UseAbilityObjective : QuestObjective, IObjectiveListener<AbilityUsedAt>
    {
        [Tooltip("Fähigkeits-ID, z. B. ability.aether.aether_stoss.")]
        [IdRef("ability.")] [SerializeField] private string abilityId = string.Empty;

        [Tooltip("Ziel-ID (Objekt, NPC, Gegner). Leer = beliebiges Ziel.")]
        [SerializeField] private string targetId = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public UseAbilityObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="abilityId">Ability id.</param>
        /// <param name="targetId">Target id or empty.</param>
        public UseAbilityObjective(string id, string abilityId, string targetId) : base(id)
        {
            this.abilityId = abilityId ?? string.Empty;
            this.targetId = targetId ?? string.Empty;
        }

        /// <summary>Ability id.</summary>
        public string AbilityId => abilityId ?? string.Empty;

        /// <summary>Target id or empty.</summary>
        public string TargetId => targetId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "Fähigkeit";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<AbilityUsedAt>(this);
        }

        /// <inheritdoc />
        public void Handle(in AbilityUsedAt evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.AbilityId == AbilityId && (TargetId.Length == 0 || evt.TargetId == TargetId))
            {
                rt.Complete();
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + AbilityId + (TargetId.Length > 0 ? ", " + TargetId : string.Empty) + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(abilityId, "ability.", "Fähigkeit");
            if (TargetId.Length > 0)
            {
                report.Mentions(TargetId, string.Empty);
            }
        }
    }
}
