namespace Aetherfall.World
{
    /// <summary>Condition of a building (JSON <c>state</c>).</summary>
    public enum BuildingState
    {
        /// <summary><c>intact</c>: Undamaged.</summary>
        Intact = 0,

        /// <summary><c>burned</c>: Burned: dark walls, roof partly gone.</summary>
        Burned = 1,

        /// <summary><c>collapsed</c>: Collapsed: wall stumps of uneven height, no roof, rubble.</summary>
        Collapsed = 2
    }
}
