using System;
using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;

namespace Aetherfall.Economy
{
    /// <summary>Save data of all visited merchants (section <c>merchants</c>).</summary>
    [Serializable]
    public sealed class MerchantsDto
    {
        /// <summary>Merchant id → state.</summary>
        public Dictionary<string, MerchantDto> Merchants = new Dictionary<string, MerchantDto>();
    }

    /// <summary>Save data of one merchant.</summary>
    [Serializable]
    public sealed class MerchantDto
    {
        /// <summary>Gold now.</summary>
        public int Gold;

        /// <summary>Pieces left per stock line.</summary>
        public List<int> Stock = new List<int>();

        /// <summary>Item id → pieces sold since the restock (demand).</summary>
        public Dictionary<string, int> Sold = new Dictionary<string, int>();

        /// <summary>Items for buyback, newest first.</summary>
        public List<BuybackDto> Buyback = new List<BuybackDto>();

        /// <summary>Restock period of the last visit.</summary>
        public long RestockPeriod;

        /// <summary>Game day of the last gold refill.</summary>
        public long GoldDay;
    }

    /// <summary>One buyback entry.</summary>
    [Serializable]
    public sealed class BuybackDto
    {
        /// <summary>The sold item.</summary>
        public ItemInstanceDto Item;

        /// <summary>Price of the entry.</summary>
        public int Price;
    }

    /// <summary>Saves the merchants (after the inventory, whose item catalog it uses).</summary>
    public sealed class MerchantSaveable : Saveable<MerchantsDto>
    {
        /// <summary>Section key.</summary>
        public const string Key = "merchants";

        /// <summary>Load order (after the inventory, 50).</summary>
        public const int Order = 60;

        private readonly MerchantService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Merchant service.</param>
        public MerchantSaveable(MerchantService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override MerchantsDto Capture()
        {
            return _service.Capture();
        }

        /// <inheritdoc />
        protected override void Restore(MerchantsDto data, in LoadContext ctx)
        {
            _service.Restore(data);
        }
    }
}
