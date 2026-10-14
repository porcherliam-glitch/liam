using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Sammle X Items" (GDD 02 5.1 type 3, short code <c>Sammle</c>): the progress is the number of owned pieces.
    /// Pieces owned at the stage start count at once, the counter sinks when items are sold or handed in (GDD 02 5.2);
    /// updated on <c>InventoryChanged</c> of the player and re-counted after loading.
    /// </summary>
    /// <remarks>TODO (item tags): collecting by item tag instead of one item id.</remarks>
    [Serializable]
    [TypeMenu("Ziele/Sammle Items", 2)]
    public sealed class CollectObjective : QuestObjective, IObjectiveListener<InventoryChanged>
    {
        [Tooltip("Item-ID, z. B. item.herb.blutwurz.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Anzahl.")]
        [Min(1)] [SerializeField] private int count = 1;

        /// <summary>Creates an empty objective.</summary>
        public CollectObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="count">Number of pieces.</param>
        public CollectObjective(string id, string itemId, int count) : base(id)
        {
            this.itemId = itemId ?? string.Empty;
            this.count = count;
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Sammle";

        /// <inheritdoc />
        public override bool CanRegress => true;

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<InventoryChanged>(this);
        }

        /// <inheritdoc />
        public override void OnStageStarted(ObjectiveRuntime rt, in QuestContext ctx)
        {
            rt.Set(ctx.CountItem(ItemId));
        }

        /// <inheritdoc />
        public override void OnAfterLoad(ObjectiveRuntime rt, in QuestContext ctx)
        {
            rt.Set(ctx.CountItem(ItemId));
        }

        /// <inheritdoc />
        public void Handle(in InventoryChanged evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.ItemId != ItemId || evt.OwnerId != SubjectIds.Player)
            {
                return;
            }

            rt.Set(evt.NewCount);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + ItemId + ", " + count + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(itemId, "item.", "Item");
        }
    }
}
