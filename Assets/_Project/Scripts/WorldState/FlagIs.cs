using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Condition "Weltzustand-Flag X" (architecture 7.7 <c>FlagIs</c>, §6.4): compares a flag with a value. Bool flags: value
    /// 1 = set, 0 = not set; enums: value from the value list; counters: e.g. ≥ 25. Re-evaluated on <c>FlagChanged</c> of this
    /// flag only.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Flag", 0)]
    public sealed class FlagIs : Condition
    {
        [Tooltip("Flag-ID, z. B. flag.eichental.harrik_verschont oder stat.global.banditen_getoetet.")]
        [IdRef("flag.")] [SerializeField] private string flagId = string.Empty;

        [Tooltip("Vergleich.")]
        [SerializeField] private FlagComparison comparison = FlagComparison.Equal;

        [Tooltip("Vergleichswert. Bool: 1 = gesetzt, 0 = nicht gesetzt. Enum: Wert aus der Werteliste.")]
        [SerializeField] private int value = 1;

        /// <summary>Creates an empty condition.</summary>
        public FlagIs()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="comparison">Comparison.</param>
        /// <param name="value">Value.</param>
        public FlagIs(string flagId, FlagComparison comparison, int value)
        {
            this.flagId = flagId ?? string.Empty;
            this.comparison = comparison;
            this.value = value;
        }

        /// <summary>Creates "flag = value".</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">Value.</param>
        public FlagIs(string flagId, int value) : this(flagId, FlagComparison.Equal, value)
        {
        }

        /// <summary>Flag id.</summary>
        public string FlagId => flagId;

        /// <summary>Comparison.</summary>
        public FlagComparison Comparison => comparison;

        /// <summary>Value.</summary>
        public int Value => value;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            int actual = ctx.Get<IWorldState>().GetInt(flagId);
            return FlagComparer.Matches(actual, comparison, value);
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.OnFlag(flagId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Flag " + (flagId.Length > 0 ? flagId : "?") + " " + FlagComparer.Symbol(comparison) + " " + value;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Flag-ID ist leer.");
                return;
            }

            report.ReadsFlag(flagId, value);
        }
    }
}
