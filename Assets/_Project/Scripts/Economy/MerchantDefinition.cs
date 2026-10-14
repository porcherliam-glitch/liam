using System;
using System.Collections.Generic;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Economy
{
    /// <summary>Merchant types of GDD 04 8.2 used so far (values may be stored in assets: never renumber).</summary>
    public enum MerchantKind
    {
        /// <summary>General goods (gold base 400): consumables, basic gear, buys everything.</summary>
        General = 0,

        /// <summary>Weaponsmith (gold base 800): weapons, shields, metal armour.</summary>
        Weaponsmith = 1
    }

    /// <summary>One line of a merchant's stock.</summary>
    [Serializable]
    public sealed class MerchantStockEntry
    {
        [Tooltip("Item-ID, z. B. item.weapon.einhandschwert_eisen.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Stückzahl nach jedem Auffüllen.")]
        [Min(1)] [SerializeField] private int count = 1;

        /// <summary>Creates an empty entry (inspector).</summary>
        public MerchantStockEntry()
        {
        }

        /// <summary>Creates an entry.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="count">Pieces after each restock.</param>
        public MerchantStockEntry(string itemId, int count)
        {
            this.itemId = itemId ?? string.Empty;
            this.count = Math.Max(1, count);
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>Pieces after each restock.</summary>
        public int Count => count;
    }

    /// <summary>
    /// A merchant (GDD 04 8.2, id <c>merchant.&lt;region&gt;.&lt;name&gt;</c>): the NPC who trades, the kind, the stock that comes back
    /// at every restock, the gold base and the region level for the gold stock, and the goods the region has plenty of or lacks
    /// (region factor of the price formula, 8.4).
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Wirtschaft/Händler", fileName = "Merchant", order = 90)]
    public sealed class MerchantDefinition : GameDefinition
    {
        [Tooltip("NPC, der handelt (Gespräch mit Ende „Handeln“).")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        [Tooltip("Name im Handelsfenster, z. B. „Schmiede von Lindenhain“.")]
        [SerializeField] private string displayName = string.Empty;

        [SerializeField] private MerchantKind kind = MerchantKind.General;

        [Tooltip("Gold-Basis des Händlertyps (Allgemeinwaren 400, Waffenschmied 800).")]
        [Min(0)] [SerializeField] private int goldBase = 400;

        [Tooltip("Mitte des Stufenbands der Region (Eichental: 5).")]
        [Range(1, 80)] [SerializeField] private int regionLevel = 5;

        [Tooltip("Spieltage bis zum Auffüllen (GDD 04 8.2: 3).")]
        [Range(1, 30)] [SerializeField] private int restockDays = 3;

        [SerializeField] private List<MerchantStockEntry> stock = new List<MerchantStockEntry>();

        [Tooltip("Waren, von denen die Region viel hat (billiger, Ankauf schlechter).")]
        [IdRef("item.")] [SerializeField] private List<string> surplusItems = new List<string>();

        [Tooltip("Waren, die in der Region fehlen (teurer, Ankauf besser).")]
        [IdRef("item.")] [SerializeField] private List<string> scarceItems = new List<string>();

        /// <summary>NPC who trades.</summary>
        public string NpcId => npcId ?? string.Empty;

        /// <summary>Name in the trade window.</summary>
        public string DisplayName => string.IsNullOrEmpty(displayName) ? Id : displayName;

        /// <summary>Merchant kind.</summary>
        public MerchantKind Kind => kind;

        /// <summary>Gold base.</summary>
        public int GoldBase => goldBase;

        /// <summary>Region level.</summary>
        public int RegionLevel => regionLevel;

        /// <summary>Game days between restocks.</summary>
        public int RestockDays => restockDays;

        /// <summary>Stock after a restock.</summary>
        public IReadOnlyList<MerchantStockEntry> Stock => stock;

        /// <summary>Most gold the merchant holds (<see cref="MerchantPricing.GoldStock"/>).</summary>
        public int MaxGold => MerchantPricing.GoldStock(goldBase, regionLevel);

        /// <summary>Region factor of an item when buying.</summary>
        /// <param name="itemId">Item id.</param>
        public float BuyRegionFactor(string itemId)
        {
            return surplusItems.Contains(itemId) ? MerchantPricing.Surplus : scarceItems.Contains(itemId) ? MerchantPricing.ScarceBuy : 1f;
        }

        /// <summary>Region factor of an item when selling.</summary>
        /// <param name="itemId">Item id.</param>
        public float SellRegionFactor(string itemId)
        {
            return surplusItems.Contains(itemId) ? MerchantPricing.Surplus : scarceItems.Contains(itemId) ? MerchantPricing.ScarceSell : 1f;
        }

#if UNITY_EDITOR
        /// <summary>Fills the merchant from code (editor generators and tests).</summary>
        /// <param name="merchantNpcId">NPC id.</param>
        /// <param name="name">Display name.</param>
        /// <param name="merchantKind">Kind.</param>
        /// <param name="gold">Gold base.</param>
        /// <param name="level">Region level.</param>
        /// <param name="entries">Stock.</param>
        /// <param name="surplus">Surplus item ids.</param>
        /// <param name="scarce">Scarce item ids.</param>
        public void EditorSetUp(string merchantNpcId, string name, MerchantKind merchantKind, int gold, int level, IEnumerable<MerchantStockEntry> entries,
            IEnumerable<string> surplus, IEnumerable<string> scarce)
        {
            npcId = merchantNpcId;
            displayName = name;
            kind = merchantKind;
            goldBase = gold;
            regionLevel = level;
            stock = new List<MerchantStockEntry>(entries);
            surplusItems = new List<string>(surplus);
            scarceItems = new List<string>(scarce);
        }
#endif
    }
}
