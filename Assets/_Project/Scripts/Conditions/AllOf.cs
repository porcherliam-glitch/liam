using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// Logic AND (architecture 7.2): holds if every entry holds. An empty list holds; an empty entry (null, unknown type)
    /// does not hold and is a validator error (V14). Use it as root when a field needs several conditions.
    /// </summary>
    [Serializable]
    [TypeMenu("Logik/UND (alle)", 0)]
    public sealed class AllOf : Condition
    {
        [Tooltip("Alle diese Bedingungen müssen erfüllt sein. Leere Liste = erfüllt.")]
        [SerializeReference] private List<Condition> conditions = new List<Condition>();

        /// <summary>Creates an empty AND (holds).</summary>
        public AllOf()
        {
        }

        /// <summary>Creates an AND of the given conditions (code-built data: tests, procedural content).</summary>
        /// <param name="conditions">Entries.</param>
        public AllOf(params Condition[] conditions)
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
                if (!ConditionEvaluator.Evaluate(conditions[i], ctx))
                {
                    return false;
                }
            }

            return true;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            if (conditions.Count == 0)
            {
                // An empty AND always holds: constant, never polled.
                triggers.Constant();
                return;
            }

            for (int i = 0; i < conditions.Count; i++)
            {
                triggers.CollectChild(conditions[i]);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return conditions.Count == 0 ? "immer (leeres UND)" : Join(conditions, " UND ");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.ValidateConditions(conditions, "UND");
        }

        internal static string Join(List<Condition> entries, string separator)
        {
            var builder = new StringBuilder();
            builder.Append('(');
            for (int i = 0; i < entries.Count; i++)
            {
                if (i > 0)
                {
                    builder.Append(separator);
                }

                builder.Append(entries[i] != null ? entries[i].Describe() : "?");
            }

            builder.Append(')');
            return builder.ToString();
        }
    }
}
