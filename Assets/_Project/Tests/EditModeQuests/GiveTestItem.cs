using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Stand-in for the action <c>GiveItem</c> (architecture 7.7, assembly Inventory; not built yet, see guide 08): adds items
    /// to the <see cref="TestQuestInventory"/>. GDD notation <c>GibItem(item, n)</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Test/Item geben")]
    public sealed class GiveTestItem : GameAction
    {
        private readonly string _itemId;
        private readonly int _amount;

        /// <summary>Creates the action.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Amount.</param>
        public GiveTestItem(string itemId, int amount = 1)
        {
            _itemId = itemId ?? string.Empty;
            _amount = amount;
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<TestQuestInventory>().Add(_itemId, _amount);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "GibItem(" + _itemId + ", " + _amount + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(_itemId, "item.", "Item");
        }
    }
}
