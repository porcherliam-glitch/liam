using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Action "Item entfernen" (architecture 7.7 <c>RemoveItem</c>, §6.4): takes pieces of an item out of the subject's bag
    /// (never equipped pieces), e.g. the hand-in of a quest. If the bag holds fewer pieces nothing is taken and a warning is
    /// logged; check it before with the condition "Inventar/Besitzt Item" (bag only).
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Item entfernen", 11)]
    public sealed class RemoveItem : GameAction
    {
        [Tooltip("Item-ID.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Anzahl.")]
        [Min(1)] [SerializeField] private int amount = 1;

        /// <summary>Creates an empty action.</summary>
        public RemoveItem()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Count.</param>
        public RemoveItem(string itemId, int amount = 1)
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
            IInventoryService inventory = ctx.Get<IInventoryService>();
            if (!inventory.TryRemove(ctx.SubjectId, ItemId, amount, ctx.SourceId))
            {
                Log.Warning(LogCategory.Data, "RemoveItem: '" + ctx.SubjectId + "' has only " + inventory.CountInBag(ctx.SubjectId, ItemId) + " of " + amount +
                                              "x '" + ItemId + "' in the bag - nothing taken (source '" + ctx.SourceId + "').");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Entferne " + amount + "× " + (ItemId.Length > 0 ? ItemId : "?");
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(itemId, "item.", "Item");
            report.RequirePositive(amount, "Anzahl");
        }
    }
}
