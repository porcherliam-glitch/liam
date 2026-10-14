namespace Aetherfall.World.Dungeons
{
    /// <summary>Kind of a <see cref="DungeonWallSegment"/>.</summary>
    public enum DungeonWallKind
    {
        /// <summary>Full wall between floor and void.</summary>
        Wall = 0,

        /// <summary>Header above an opening where the neighbour's ceiling is lower.</summary>
        Lintel = 1,

        /// <summary>Step face where the neighbour's floor is higher.</summary>
        Riser = 2
    }
}
