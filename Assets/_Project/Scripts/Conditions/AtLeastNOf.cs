using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Logic "at least n of m" (architecture 7.2, proposal): holds if at least <see cref="Required"/> entries hold, e.g.
    /// "2 of 3 clues". Stops evaluating as soon as the result is certain.
    /// </summary>
    [Serializable]
    [TypeMenu("Logik/Mindestens n von m", 3)]
    public sealed class AtLeastNOf : Condition
    {
        [Tooltip("Wie viele der Bedingungen mindestens erfüllt sein müssen.")]
        [Min(1)] [SerializeField] private int required = 1;

        [Tooltip("Die Bedingungen, von denen mindestens n erfüllt sein müssen.")]
        [SerializeReference] private List<Condition> conditions = new List<Condition>();

        /// <summary>Creates an empty condition (n = 1).</summary>
        public AtLeastNOf()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="required">Minimum number of true entries.</param>
        /// <param name="conditions">Entries.</param>
        public AtLeastNOf(int required, params Condition[] conditions)
        {
            this.required = required;
            if (conditions != null)
            {
                this.conditions.AddRange(conditions);
            }
        }

        /// <summary>Minimum number of true entries.</summary>
        public int Required => required;

        /// <summary>The entries.</summary>
        public IReadOnlyList<Condition> Conditions => conditions;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            int needed = Math.Max(1, required);
            int met = 0;
            for (int i = 0; i < conditions.Count; i++)
            {
                if (ConditionEvaluator.Evaluate(conditions[i], ctx))
                {
                    met++;
                    if (met >= needed)
                    {
                        return true;
                    }
                }
                else if (met + (conditions.Count - i - 1) < needed)
                {
                    return false;
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
            return "mindestens " + required + " von " + AllOf.Join(conditions, ", ");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequirePositive(required, "Mindestanzahl");
            if (required > conditions.Count)
            {
                report.Error("V18", "Mindestens " + required + " von " + conditions.Count + " Bedingungen ist nie erfüllbar.");
            }

            report.ValidateConditions(conditions, "n von m");
        }
    }
}
