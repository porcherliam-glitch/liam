namespace Aetherfall.Inventory
{
    /// <summary>
    /// Option "Automatisch aufheben" (GDD 05 4.2, GDD 04 5.9): off, gold and materials (default), everything. Stored in
    /// assets: never renumber.
    /// </summary>
    public enum AutoPickupMode
    {
        /// <summary>Nothing is picked up automatically.</summary>
        Off = 0,

        /// <summary>Gold (5 m magnet) and materials (3 m): the default.</summary>
        GoldAndMaterials = 1,

        /// <summary>Everything within 3 m, equipment from a minimum rarity and not in combat.</summary>
        All = 2
    }
}
