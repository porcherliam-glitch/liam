namespace Aetherfall.Items
{
    /// <summary>
    /// Kind of a loot table entry (GDD 04 5.1 "Eintragsart"): item, nested table, random equipment (generator), gold,
    /// currency, nothing. Stored in assets: never renumber.
    /// </summary>
    public enum LootEntryKind
    {
        /// <summary>Nothing (an empty roll with weight).</summary>
        Nothing = 0,

        /// <summary>A fixed item (materials, potions): <c>RefId</c> = item id.</summary>
        Item = 1,

        /// <summary>A nested loot table (depth at most 4): <c>RefId</c> = table id.</summary>
        Table = 2,

        /// <summary>Random equipment from the generator (group shares weapons/armor/jewelry).</summary>
        Equipment = 3,

        /// <summary>Gold (<c>currency.gold</c>), optionally as multiple of G(L).</summary>
        Gold = 4,

        /// <summary>Another currency: <c>RefId</c> = currency id (e.g. <c>currency.aether_splitter</c>).</summary>
        Currency = 5
    }
}
