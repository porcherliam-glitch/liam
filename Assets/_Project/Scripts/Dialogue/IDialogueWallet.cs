namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The player's gold as far as dialogues need it (bribes, GDD 02 12.3). Default: <see cref="InventoryDialogueWallet"/>; a
    /// fake in tests. Registered by the dialogue installer; actions reach it through their context.
    /// </summary>
    public interface IDialogueWallet
    {
        /// <summary>Gold the player owns.</summary>
        int Gold { get; }

        /// <summary>Pays gold; false (nothing paid) if there is not enough.</summary>
        /// <param name="amount">Amount (at least 1).</param>
        /// <param name="reasonId">Reason for logs and the inventory (dialogue id).</param>
        bool TrySpendGold(int amount, string reasonId);
    }
}
