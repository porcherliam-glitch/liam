namespace Aetherfall.Core
{
    /// <summary>
    /// Gathering from harvest nodes (S30, GDD 04 6.10): rolls the yield and puts it into the player's inventory. A port in Core,
    /// because the nodes live in World and the items in Inventory; implemented by the Crafting assembly (GatheringInstaller).
    /// </summary>
    public interface IGatheringService
    {
        /// <summary>Harvests a node once.</summary>
        /// <param name="nodeId">Id of the node (source of the pickup event).</param>
        /// <param name="itemId">Item the node gives.</param>
        /// <param name="minYield">Smallest yield.</param>
        /// <param name="maxYield">Largest yield.</param>
        /// <returns>Pieces given; 0 = nothing was given (the node stays ripe).</returns>
        int Harvest(string nodeId, string itemId, int minYield, int maxYield);
    }
}
