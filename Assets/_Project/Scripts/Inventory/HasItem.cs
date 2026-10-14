using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Condition "Spieler besitzt Item X in Menge Y" (architecture 7.7 <c>HasItem</c>, §6.4): counts the pieces of the subject
    /// (player: bag plus equipment, or the bag only for hand-ins). Re-evaluated on <c>InventoryChanged</c>.
    /// </summary>
    [Serializable]
    [TypeMenu("Inventar/Besitzt Item", 0)]
    public sealed class HasItem : Condition
    {
        [Tooltip("Item-ID, z. B. item.material.wolfsfell.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Mindestanzahl.")]
        [Min(1)] [SerializeField] private int amount = 1;

        [Tooltip("Nur im Beutel zählen (ohne angelegte Ausrüstung) – für Abgaben, die das Item danach entfernen.")]
        [SerializeField] private bool bagOnly;

        /// <summary>Creates an empty condition.</summary>
        public HasItem()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Minimum count.</param>
        /// <param name="bagOnly">True = count the bag only.</param>
        public HasItem(string itemId, int amount = 1, bool bagOnly = false)
        {
            this.itemId = itemId ?? string.Empty;
            this.amount = amount;
            this.bagOnly = bagOnly;
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>Minimum count.</summary>
        public int Amount => amount;

        /// <summary>True if only the bag counts.</summary>
        public bool BagOnly => bagOnly;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            IInventoryService inventory = ctx.Get<IInventoryService>();
            int count = bagOnly ? inventory.CountInBag(ctx.SubjectId, ItemId) : inventory.CountOf(ctx.SubjectId, ItemId);
            return count >= amount;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<InventoryChanged>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Besitzt " + amount + "× " + (ItemId.Length > 0 ? ItemId : "?") + (bagOnly ? " (Beutel)" : string.Empty);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(itemId, "item.", "Item");
            report.RequirePositive(amount, "Anzahl");
        }
    }
}
