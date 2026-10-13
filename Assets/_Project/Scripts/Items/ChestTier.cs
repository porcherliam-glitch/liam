namespace Aetherfall.Items
{
    /// <summary>Chest tiers of GDD 04 5.6 (§12.5 "Truhen in verschiedenen Qualitaetsstufen"). Stored in assets: never renumber.</summary>
    public enum ChestTier
    {
        /// <summary>Tier 0: crate, barrel, sack (LQ 0).</summary>
        Crate = 0,

        /// <summary>Tier 1: wooden chest (German "Holztruhe", LQ 1).</summary>
        Wooden = 1,

        /// <summary>Tier 2: iron chest (German "Eisentruhe", LQ 2, lock tier 1).</summary>
        Iron = 2,

        /// <summary>Tier 3: hidden chest (German "Versteckte Truhe", LQ 3: 2 items, at least rare).</summary>
        Hidden = 3,

        /// <summary>Tier 4: ornate chest (German "Prunktruhe", LQ 4, item level +1).</summary>
        Ornate = 4,

        /// <summary>Tier 5: secret chest (German "Geheimnis-Truhe", LQ 5, item level +2).</summary>
        Secret = 5,

        /// <summary>Tier 6: rift chest (German "Riss-Truhe", endgame, LQ 4–6).</summary>
        Rift = 6
    }
}
