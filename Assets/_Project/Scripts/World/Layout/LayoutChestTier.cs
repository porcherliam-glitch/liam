namespace Aetherfall.World
{
    /// <summary>Chest quality (JSON <c>tier</c>, GDD 04 5.6).</summary>
    public enum LayoutChestTier
    {
        /// <summary><c>wooden</c>: Wooden chest.</summary>
        Wooden = 0,

        /// <summary><c>iron</c>: Iron chest.</summary>
        Iron = 1,

        /// <summary><c>hidden</c>: Hidden chest (loot at least rare).</summary>
        Hidden = 2
    }
}
