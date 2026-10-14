using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Action "Gold geben" (architecture 7.7 <c>GiveCurrency</c>, §6.4): adds an amount of a currency (gold, faction marks,
    /// Aether shards) to the subject. Sends <c>CurrencyChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Währung geben", 12)]
    public sealed class GiveCurrency : GameAction
    {
        [Tooltip("Währungs-ID: currency.gold oder currency.aether_splitter.")]
        [SerializeField] private string currencyId = CurrencyIds.Gold;

        [Tooltip("Betrag.")]
        [Min(1)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty action (1 gold).</summary>
        public GiveCurrency()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="amount">Amount.</param>
        /// <param name="currencyId">Currency id (default gold).</param>
        public GiveCurrency(int amount, string currencyId = CurrencyIds.Gold)
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
            if (amount <= 0 || !ctx.Get<IInventoryService>().TryChangeCurrency(ctx.SubjectId, CurrencyId, amount, ctx.SourceId))
            {
                Log.Warning(LogCategory.Data, "GiveCurrency: " + amount + " " + CurrencyId + " could not be given to '" + ctx.SubjectId + "' (source '" + ctx.SourceId + "').");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Gib " + amount + " " + CurrencyIds.GermanName(CurrencyId);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            CurrencyRules.Validate(report, CurrencyId);
            report.RequirePositive(amount, "Betrag");
        }
    }
}
