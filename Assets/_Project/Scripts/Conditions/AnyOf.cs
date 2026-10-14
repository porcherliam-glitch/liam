using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Logic OR (architecture 7.2): holds if at least one entry holds. An empty list does not hold; empty entries count as
    /// false.
    /// </summary>
    [Serializable]
    [TypeMenu("Logik/ODER (eines)", 1)]
    public sealed class AnyOf : Condition
    {
        [Tooltip("Mindestens eine dieser Bedingungen muss erfüllt sein. Leere Liste = nie erfüllt.")]
        [SerializeReference] private List<Condition> conditions = new List<Condition>();

        /// <summary>Creates an empty OR (never holds).</summary>
        public AnyOf()
        {
        }

        /// <summary>Creates an OR of the given conditions.</summary>
        /// <param name="conditions">Entries.</param>
        public AnyOf(params Condition[] conditions)
        {
            if (conditions != null)
            {
                this.conditions.AddRange(conditions);
            }
        }

        /// <summary>The entries.</summary>
        public IReadOnlyList<Condition> Conditions => conditions;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            for (int i = 0; i < conditions.Count; i++)
            {
                if (ConditionEvaluator.Evaluate(conditions[i], ctx))
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            for (int i = 0; i < conditions.Count; i++)
            {
                if (conditions[i] != null)
                {
                    conditions[i].CollectTriggers(triggers);
                }
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return conditions.Count == 0 ? "nie (leeres ODER)" : AllOf.Join(conditions, " ODER ");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (conditions.Count == 0)
            {
                report.Warning("V18", "Leeres ODER ist nie erfüllt.");
            }

            report.ValidateConditions(conditions, "ODER");
        }
    }
}
