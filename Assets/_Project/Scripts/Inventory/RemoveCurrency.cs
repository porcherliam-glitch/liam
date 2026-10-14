using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Action "Gold entfernen" (architecture 7.7 <c>RemoveCurrency</c>, §6.4): takes an amount of a currency from the subject
    /// (bribes, fees). Never below 0: if the subject owns less, nothing is taken and a warning is logged; check it before with
    /// the condition "Inventar/Waehrung mindestens".
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Währung entfernen", 13)]
    public sealed class RemoveCurrency : GameAction
    {
        [Tooltip("Währungs-ID: currency.gold oder currency.aether_splitter.")]
        [SerializeField] private string currencyId = CurrencyIds.Gold;

        [Tooltip("Betrag.")]
        [Min(1)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty action (1 gold).</summary>
        public RemoveCurrency()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="amount">Amount.</param>
        /// <param name="currencyId">Currency id (default gold).</param>
        public RemoveCurrency(int amount, string currencyId = CurrencyIds.Gold)
        {
            this.amount = amount;
            this.currencyId = currencyId ?? string.Empty;
        }

        /// <summary>Currency id.</summary>
        public string CurrencyId => currencyId ?? string.Empty;

        /// <summary>Amount.</summary>
        public int Amount => amount;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            IInventoryService inventory = ctx.Get<IInventoryService>();
            if (amount <= 0 || inventory.GetCurrency(ctx.SubjectId, CurrencyId) < amount ||
                !inventory.TryChangeCurrency(ctx.SubjectId, CurrencyId, -amount, ctx.SourceId))
            {
                Log.Warning(LogCategory.Data, "RemoveCurrency: '" + ctx.SubjectId + "' cannot pay " + amount + " " + CurrencyId + " (owns " +
                                              inventory.GetCurrency(ctx.SubjectId, CurrencyId) + ", source '" + ctx.SourceId + "').");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Entferne " + amount + " " + CurrencyIds.GermanName(CurrencyId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            CurrencyRules.Validate(report, CurrencyId);
            report.RequirePositive(amount, "Betrag");
        }
    }
}
