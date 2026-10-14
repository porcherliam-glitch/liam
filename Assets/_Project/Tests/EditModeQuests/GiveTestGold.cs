using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Stand-in for the action <c>GiveCurrency</c> with gold (architecture 7.7, assembly Inventory; not built yet, see guide
    /// 08). GDD notation <c>GibGold(n)</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Test/Gold geben")]
    public sealed class GiveTestGold : GameAction
    {
        private readonly int _amount;

        /// <summary>Creates the action.</summary>
        /// <param name="amount">Gold.</param>
        public GiveTestGold(int amount)
        {
            _amount = amount;
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<TestQuestInventory>().AddGold(_amount);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "GibGold(" + _amount + ")";
        }
    }
}
