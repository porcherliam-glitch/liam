using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Treffe ein Ziel" (proposal, beyond the 26 types of GDD 02 5.1; for training and tutorial stages): counts hits
    /// that dealt damage (<c>DamageDealt</c>) on one of the target ids, by the player unless another attacker is set. An id
    /// ending with <c>*</c> matches a group. The target id is the combatant id of the hit object (e.g. <c>trainingspuppe</c>),
    /// not a content id, so the validator does not look it up.
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Treffe Ziel", 14)]
    public sealed class HitTargetObjective : QuestObjective, IObjectiveListener<DamageDealt>
    {
        [Tooltip("Kampf-IDs der Ziele (Combatant-ID), z. B. trainingspuppe. Ein * am Ende passt auf eine Gruppe.")]
        [SerializeField] private List<string> targetIds = new List<string>();

        [Tooltip("Anzahl Treffer.")]
        [Min(1)] [SerializeField] private int count = 1;

        [Tooltip("Wer treffen muss (Combatant-ID). Standard: player. Leer = jeder.")]
        [SerializeField] private string attackerId = "player";

        /// <summary>Creates an empty objective.</summary>
        public HitTargetObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="count">Number of hits.</param>
        /// <param name="targetIds">Combatant ids of the targets (trailing <c>*</c> = group).</param>
        public HitTargetObjective(string id, int count, params string[] targetIds) : base(id)
        {
            this.count = count;
            if (targetIds != null)
            {
                this.targetIds.AddRange(targetIds);
            }
        }

        /// <summary>Target ids.</summary>
        public IReadOnlyList<string> TargetIds => targetIds;

        /// <summary>Attacker filter (empty = anyone).</summary>
        public string AttackerId => attackerId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Treffe";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<DamageDealt>(this);
        }

        /// <inheritdoc />
        public void Handle(in DamageDealt evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (AttackerId.Length > 0 && evt.AttackerId != AttackerId)
            {
                return;
            }

            if (Matches(evt.TargetId))
            {
                rt.Add(1);
            }
        }

        /// <summary>True if the target id matches one of the configured ids or groups.</summary>
        /// <param name="targetId">Combatant id of the hit target.</param>
        public bool Matches(string targetId)
        {
            if (string.IsNullOrEmpty(targetId))
            {
                return false;
            }

            for (int i = 0; i < targetIds.Count; i++)
            {
                string pattern = targetIds[i];
                if (string.IsNullOrEmpty(pattern))
                {
                    continue;
                }

                bool group = pattern[pattern.Length - 1] == '*';
                if (group ? targetId.StartsWith(pattern.Substring(0, pattern.Length - 1), StringComparison.Ordinal) : pattern == targetId)
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + string.Join(", ", targetIds) + ", " + count + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            if (targetIds.Count == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Treffe: keine Ziel-ID angegeben.");
                return;
            }

            for (int i = 0; i < targetIds.Count; i++)
            {
                if (string.IsNullOrEmpty(targetIds[i]))
                {
                    report.Error(ValidationReportExtensions.InvalidParameterCode, "Treffe: leere Ziel-ID.");
                }
            }
        }
    }
}
