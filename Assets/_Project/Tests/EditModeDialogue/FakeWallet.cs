using System.Collections.Generic;
using Aetherfall.Dialogue;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Gold of the player in tests; records every payment.</summary>
    public sealed class FakeWallet : IDialogueWallet
    {
        /// <inheritdoc />
        public int Gold { get; set; }

        /// <summary>Payments: amount and reason.</summary>
        public List<string> Payments { get; } = new List<string>();

        /// <inheritdoc />
        public bool TrySpendGold(int amount, string reasonId)
        {
            if (amount > Gold)
            {
                return false;
            }

            Gold -= amount;
            Payments.Add(amount + " " + reasonId);
            return true;
        }
    }
}
