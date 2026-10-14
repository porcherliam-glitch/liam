using System;
using Aetherfall.Inventory;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Default <see cref="IDialogueWallet"/>: the gold of the player in the inventory service (sends <c>CurrencyChanged</c>
    /// when paying, so the HUD shows "−80 Gold").
    /// </summary>
    public sealed class InventoryDialogueWallet : IDialogueWallet
    {
        /// <summary>Currency id of gold (same value as <c>Aetherfall.Items.CurrencyIds.Gold</c>; Dialogue does not reference Items).</summary>
        public const string GoldCurrencyId = "currency.gold";

        /// <summary>Owner id of the player (same value as <c>InventoryOwners.Player</c>).</summary>
        public const string PlayerOwnerId = InventoryOwners.Player;

        private readonly IInventoryService _inventory;

        /// <summary>Creates the wallet.</summary>
        /// <param name="inventory">Inventory service.</param>
        public InventoryDialogueWallet(IInventoryService inventory)
        {
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
        }

        /// <inheritdoc />
        public int Gold => _inventory.GetCurrency(PlayerOwnerId, GoldCurrencyId);

        /// <inheritdoc />
        public bool TrySpendGold(int amount, string reasonId)
        {
            if (amount <= 0)
            {
                return true;
            }

            if (Gold < amount)
            {
                return false;
            }

            return _inventory.TryChangeCurrency(PlayerOwnerId, GoldCurrencyId, -amount, reasonId);
        }
    }
}
