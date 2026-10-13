namespace Aetherfall.Inventory
{
    /// <summary>Owner ids of containers (architecture 11.6 <c>GetContainer(ownerId)</c>).</summary>
    public static class InventoryOwners
    {
        /// <summary>The player (reserved id, architecture 6.1).</summary>
        public const string Player = "player";

        /// <summary>The shared storage chest of all houses (GDD 04 1.7, Phase 5).</summary>
        public const string HouseStorage = "container.house.lager";
    }
}
