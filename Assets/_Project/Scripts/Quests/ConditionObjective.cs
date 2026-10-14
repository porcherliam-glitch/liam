using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Bedingung erfuellt" (GDD 02 5.2 "Bedingungs-Ziel", e.g. "Greif das Lager an" = group hostile): fulfilled
    /// while a condition from §6.4 holds, re-checked on every relevant state change by the condition watcher (architecture
    /// 7.5). Optionally it stays fulfilled once reached.
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Bedingung erfüllt", 13)]
    public sealed class ConditionObjective : QuestObjective, IObjectiveConditionListener
    {
        [Tooltip("Bedingung, die erfüllt sein muss.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Bleibt erfüllt, auch wenn die Bedingung später wieder falsch wird.")]
        [SerializeField] private bool latch = true;

        /// <summary>Creates an empty objective.</summary>
        public ConditionObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="condition">Condition.</param>
        /// <param name="latch">True if it stays fulfilled once reached.</param>
        public ConditionObjective(string id, Condition condition, bool latch = true) : base(id)
        {
            this.condition = condition;
            this.latch = latch;
        }

        /// <summary>The condition.</summary>
        public Condition Condition => condition;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "Bedingung";

        /// <inheritdoc />
        public override bool CanRegress => !latch;

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.WatchCondition(condition, this);
        }

        /// <inheritdoc />
        public void OnConditionChanged(bool isMet, ObjectiveRuntime rt, in QuestContext ctx)
        {
            rt.Set(isMet ? 1 : 0);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + (condition != null ? condition.Describe() : "?") + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.ValidateRequired(condition, "Bedingung");
        }
    }
}
