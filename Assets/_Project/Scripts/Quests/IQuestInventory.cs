namespace Aetherfall.Quests
{
    /// <summary>
    /// The part of the inventory that quest objectives need (GDD 02 5.2: "Vorhandenes zaehlt sofort"): how many pieces of an
    /// item the player owns. Narrow on purpose so quest logic stays testable; in the game <see cref="InventoryQuestBridge"/>
    /// forwards to <c>IInventoryService</c>.
    /// </summary>
    public interface IQuestInventory
    {
        /// <summary>Number of pieces the player owns (bag plus equipment).</summary>
        /// <param name="itemId">Item id.</param>
        int CountOf(string itemId);
    }
}
