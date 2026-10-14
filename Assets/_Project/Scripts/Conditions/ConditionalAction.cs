using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Conditions
{
    /// <summary>
    /// "If - then - else" action (proposal): runs <see cref="Then"/> if the condition holds, otherwise <see cref="Else"/>.
    /// Covers GDD 02 cases like "SetzeFlag(tobold_gerettet, o2)" (set the flag depending on an objective) and actions
    /// that only apply in one outcome. A missing condition holds.
    /// </summary>
    [Serializable]
    [TypeMenu("Logik/Wenn – dann – sonst", 20)]
    public sealed class ConditionalAction : GameAction
    {
        [Tooltip("Bedingung. Leer = immer „dann“.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Aktionen, wenn die Bedingung erfüllt ist (in Listenreihenfolge).")]
        [SerializeReference] private List<GameAction> thenActions = new List<GameAction>();

        [Tooltip("Aktionen, wenn die Bedingung nicht erfüllt ist.")]
        [SerializeReference] private List<GameAction> elseActions = new List<GameAction>();

        /// <summary>Creates an empty action.</summary>
        public ConditionalAction()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="condition">Condition (null = always "then").</param>
        /// <param name="thenActions">Actions if it holds.</param>
        /// <param name="elseActions">Actions otherwise (may be null).</param>
        public ConditionalAction(Condition condition, IEnumerable<GameAction> thenActions, IEnumerable<GameAction> elseActions = null)
        {
            this.condition = condition;
            if (thenActions != null)
            {
                this.thenActions.AddRange(thenActions);
            }

            if (elseActions != null)
            {
                this.elseActions.AddRange(elseActions);
            }
        }

        /// <summary>The condition.</summary>
        public Condition Condition => condition;

        /// <summary>Actions if the condition holds.</summary>
        public IReadOnlyList<GameAction> Then => thenActions;

        /// <summary>Actions otherwise.</summary>
        public IReadOnlyList<GameAction> Else => elseActions;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            bool met = ConditionEvaluator.IsMet(condition, ctx.ToConditionContext());
            ActionRunner.Run(met ? (IReadOnlyList<GameAction>)thenActions : elseActions, ctx);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Wenn " + (condition != null ? condition.Describe() : "immer") + ": " + thenActions.Count + " Aktion(en), sonst " + elseActions.Count;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.ValidateOptional(condition, "Wenn");
            report.ValidateActions(thenActions, "dann");
            report.ValidateActions(elseActions, "sonst");
        }
    }
}
