using System;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>Logic NOT (architecture 7.2): negates exactly one entry. An empty entry counts as false, so NOT holds.</summary>
    [Serializable]
    [TypeMenu("Logik/NICHT", 2)]
    public sealed class Not : Condition
    {
        [Tooltip("Diese Bedingung darf NICHT erfüllt sein.")]
        [SerializeReference] private Condition condition;

        /// <summary>Creates an empty NOT.</summary>
        public Not()
        {
        }

        /// <summary>Creates a NOT of the given condition.</summary>
        /// <param name="condition">Negated condition.</param>
        public Not(Condition condition)
        {
            this.condition = condition;
        }

        /// <summary>The negated condition (may be null in broken data).</summary>
        public Condition Inner => condition;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return !ConditionEvaluator.Evaluate(condition, ctx);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            if (condition != null)
            {
                condition.CollectTriggers(triggers);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "NICHT " + (condition != null ? condition.Describe() : "?");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.ValidateRequired(condition, "NICHT");
        }
    }
}
