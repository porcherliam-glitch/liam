using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Bringe Item zu NPC" (GDD 02 5.1 type 4, short code <c>Bringe</c>): counts <c>ItemDelivered</c> of the item to
    /// the NPC. The hand-in (dialogue action) removes the items and sends the event.
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Bringe Item zu NPC", 3)]
    public sealed class DeliverItemObjective : QuestObjective, IObjectiveListener<ItemDelivered>
    {
        [Tooltip("Item-ID.")]
        [IdRef("item.")] [SerializeField] private string itemId = string.Empty;

        [Tooltip("Anzahl.")]
        [Min(1)] [SerializeField] private int count = 1;

        [Tooltip("Empfänger-NPC.")]
        [IdRef("npc.")] [SerializeField] private string npcId = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public DeliverItemObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="itemId">Item id.</param>
        /// <param name="count">Number of pieces.</param>
        /// <param name="npcId">Receiving NPC.</param>
        public DeliverItemObjective(string id, string itemId, int count, string npcId) : base(id)
        {
            this.itemId = itemId ?? string.Empty;
            this.count = count;
            this.npcId = npcId ?? string.Empty;
        }

        /// <summary>Item id.</summary>
        public string ItemId => itemId ?? string.Empty;

        /// <summary>Receiving NPC.</summary>
        public string NpcId => npcId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Bringe";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<ItemDelivered>(this);
        }

        /// <inheritdoc />
        public void Handle(in ItemDelivered evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.ItemId == ItemId && evt.NpcId == NpcId)
            {
                rt.Add(evt.Amount);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + ItemId + " x" + count + " → " + NpcId + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(itemId, "item.", "Item");
            report.RequireId(npcId, "npc.", "Empfänger-NPC");
        }
    }
}
