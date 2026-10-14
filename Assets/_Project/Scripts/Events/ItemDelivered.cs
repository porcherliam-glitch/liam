using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player handed items over to an NPC (architecture 4.3, area Items; quest objective "Bringe Item zu NPC", GDD 02 5.1
    /// type 4). Sender: the hand-in (dialogue action, later step); the sender removes the items. Receivers: quests.
    /// </summary>
    public readonly struct ItemDelivered : IGameEvent
    {
        /// <summary>Item id.</summary>
        public readonly string ItemId;

        /// <summary>Number of delivered items.</summary>
        public readonly int Amount;

        /// <summary>Receiving NPC.</summary>
        public readonly string NpcId;

        /// <summary>Creates the event.</summary>
        /// <param name="itemId">Item id.</param>
        /// <param name="amount">Number of items.</param>
        /// <param name="npcId">NPC id.</param>
        public ItemDelivered(string itemId, int amount, string npcId)
        {
            ItemId = itemId ?? string.Empty;
            Amount = amount;
            NpcId = npcId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ItemDelivered(" + ItemId + " x" + Amount + " to " + NpcId + ")";
        }
    }
}
