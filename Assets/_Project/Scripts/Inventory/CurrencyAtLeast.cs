using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Condition "Waehrung mindestens" (architecture 7.7 proposal <c>CurrencyAtLeast</c>): the subject owns at least this amount
    /// of a currency (gold, faction marks, Aether shards). Re-evaluated on <c>CurrencyChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Währung mindestens", 1)]
    public sealed class CurrencyAtLeast : Condition
    {
        [Tooltip("Währungs-ID: currency.gold oder currency.aether_splitter.")]
        [SerializeField] private string currencyId = CurrencyIds.Gold;

        [Tooltip("Mindestbetrag.")]
        [Min(0)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty condition (1 gold).</summary>
        public CurrencyAtLeast()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="currencyId">Currency id.</param>
        /// <param name="amount">Minimum amount.</param>
        public CurrencyAtLeast(string currencyId, int amount)
        {
            this.currencyId = currencyId ?? string.Empty;
            this.amount = amount;
        }

        /// <summary>Currency id.</summary>
        public string CurrencyId => currencyId ?? string.Empty;

        /// <summary>Minimum amount.</summary>
        public int Amount => amount;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IInventoryService>().GetCurrency(ctx.SubjectId, CurrencyId) >= amount;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<CurrencyChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Hat " + amount + " " + CurrencyIds.GermanName(CurrencyId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            CurrencyRules.Validate(report, CurrencyId);
        }
    }
}
