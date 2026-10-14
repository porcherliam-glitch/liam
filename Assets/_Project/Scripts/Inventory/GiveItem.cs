using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Action "Item geben" (architecture 7.7 <c>GiveItem</c>, §6.4, GDD notation <c>GibItem(item, n)</c>): adds fixed pieces of
    /// an item (base rarity) to the subject's inventory. Sends <c>ItemPickedUp</c> and <c>InventoryChanged</c> with the quest
    /// or dialogue as source.
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Item geben", 10)]
    public sealed class GiveItem : GameAction
    {
        [Tooltip("Item-ID, z. B. item.potion.heiltrank_schwach.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Anzahl.")]
        [Min(1)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty action.</summary>
        public GiveItem()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Count.</param>
        public GiveItem(string itemId, int amount = 1)
        {
            this.itemId = itemId ?? string.Empty;
            this.amount = amount;
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>Count.</summary>
        public int Amount => amount;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            if (!ctx.Get<IInventoryService>().TryAddNew(ctx.SubjectId, ItemId, amount, ctx.SourceId))
            {
                Log.Warning(LogCategory.Data, "GiveItem: " + amount + "x '" + ItemId + "' could not be given to '" + ctx.SubjectId + "' (unknown item or full) - source '" +
                                              ctx.SourceId + "'.");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Gib " + amount + "× " + (ItemId.Length > 0 ? ItemId : "?");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(itemId, "item.", "Item");
            report.RequirePositive(amount, "Anzahl");
        }
    }
}
